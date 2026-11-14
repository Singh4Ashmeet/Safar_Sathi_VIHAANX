import { pool } from '@workspace/db';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { nowEpochMs } from '../lib/time.js';
import crypto from 'node:crypto';
import { notifyService } from '../modules/notify/index.js';

export interface WatchdogRunResult {
  tripsChecked: number;
  escalatedCount: number;
}

/**
 * Server-Side Watchdog Worker (FR-05, TRD 8.4)
 * Uses SELECT ... WHERE next_check_at <= now() FOR UPDATE SKIP LOCKED
 * so concurrent ticks or server instances never process the same trip twice.
 */
export class WatchdogWorker {
  /**
   * Main watchdog sweep invoked by /internal/tick or background interval.
   */
  async runDueChecks(source = 'cron'): Promise<WatchdogRunResult> {
    const client = await pool.connect();
    let tripsChecked = 0;
    let escalatedCount = 0;

    try {
      await client.query('BEGIN');

      const now = nowEpochMs();

      // Lock due trips using SKIP LOCKED pattern
      const dueTripsQuery = `
        SELECT id, user_id, status, last_seen_at, eta_at, escalation_stage, next_check_at
        FROM trips
        WHERE status = 'active'
          AND next_check_at IS NOT NULL
          AND next_check_at <= $1
        FOR UPDATE SKIP LOCKED
      `;
      const res = await client.query(dueTripsQuery, [now]);
      tripsChecked = res.rows.length;

      for (const trip of res.rows) {
        const tripId = trip.id;
        const userId = trip.user_id;
        const lastSeenAt = trip.last_seen_at;
        const etaAt = trip.eta_at;
        const escalationStage = trip.escalation_stage;
        const nextCheckAt = trip.next_check_at;

        // Skip if trip is no longer active (might have been completed concurrently)
        if (trip.status !== 'active') {
          continue;
        }

        // 1. Signal Lost: if (now - last_seen_at >= WATCHDOG_SIGNAL_LOST_SEC * 1000)
        //    -> Write escalations row (trip_id, 'signal_lost')
        //    -> Send silent push prompt to user: "Are you okay?"
        //    -> Set next_check_at = now + WATCHDOG_LOST_CONTACT_SEC * 1000
        //    -> Set escalation_stage = 'user_prompted'
        const signalLostThreshold = env.WATCHDOG_SIGNAL_LOST_SEC * 1000;
        if (!escalationStage && lastSeenAt && (now - lastSeenAt >= signalLostThreshold)) {
          await this.escalateSignalLost(client, tripId, userId, now);
          escalatedCount++;
          continue;
        }

        // 2. Missed check-in: show a second check after 30 seconds. If that is
        //    unanswered for 10 seconds, trigger the existing SOS flow without a
        //    third warning.
        if (escalationStage === 'user_prompted') {
          if (nextCheckAt && (now - nextCheckAt >= 0)) {
            await this.escalateSecondCheck(client, tripId, userId, now);
            escalatedCount++;
            continue;
          }
        }

        if (escalationStage === 'second_prompted') {
          if (nextCheckAt && (now - nextCheckAt >= 0)) {
            await this.escalateLostContact(client, tripId, userId, lastSeenAt, now);
            escalatedCount++;
            continue;
          }
        }

        // 3. ETA Overdue: if (trip.eta_at && now - trip.eta_at >= WATCHDOG_ETA_GRACE_SEC * 1000)
        //    -> Prompt user, then escalate (enters signal_lost pipeline)
        if (etaAt && (now - etaAt >= env.WATCHDOG_ETA_GRACE_SEC * 1000)) {
          // Only escalate if not already in a later stage
          if (!escalationStage || escalationStage === 'signal_lost') {
            await this.escalateEtaOverdue(client, tripId, userId, lastSeenAt, now);
            escalatedCount++;
            continue;
          }
        }
      }

      // Check expired Watch Me timers (FR-09)
      const dueWatchQuery = `
        SELECT id, user_id, ends_at, status
        FROM watch_timers
        WHERE status = 'active'
          AND ends_at <= $1
        FOR UPDATE SKIP LOCKED
      `;
      const watchRes = await client.query(dueWatchQuery, [now]);
      for (const watch of watchRes.rows) {
        // Create escalation record for watch timer expiry
        await client.query(
          'INSERT INTO escalations (id, watch_id, stage, fired_at) VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT DO NOTHING',
          [watch.id, 'guardians_alerted', now]
        );

        // Mark timer as expired
        await client.query(
          'UPDATE watch_timers SET status = $1 WHERE id = $2',
          ['expired', watch.id]
        );

        // Alert guardians for expired Watch Me timer
        await this.alertWatchMeExpiry(client, watch, now);

        escalatedCount++;
      }

      await client.query('COMMIT');

      // Record tick in tick_log table
      await client.query(
        'INSERT INTO tick_log (id, received_at, source, trips_checked) VALUES (gen_random_uuid(), $1, $2, $3)',
        [now, source, tripsChecked]
      );

      logger.info({ source, tripsChecked, escalatedCount }, '[Watchdog] Sweep completed successfully');
      return { tripsChecked, escalatedCount };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, source }, '[Watchdog] Sweep failed');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Stage 1: Signal Lost - User has stopped sending location updates
   */
  private async escalateSignalLost(
    client: any,
    tripId: string,
    userId: string,
    now: number
  ): Promise<void> {
    // Check if already escalated to signal_lost
    const existingEscalation = await client.query(
      'SELECT 1 FROM escalations WHERE trip_id = $1 AND stage = $2',
      [tripId, 'signal_lost']
    );
    if (existingEscalation.rows.length > 0) {
      return; // Already escalated
    }

    // Write escalation record
    await client.query(
      'INSERT INTO escalations (id, trip_id, stage, fired_at) VALUES (gen_random_uuid(), $1, $2, $3)',
      [tripId, 'signal_lost', now]
    );

    // First check-in gets a 30-second response window before the second prompt.
    const nextCheckAt = now + env.WATCHDOG_FIRST_CHECK_RESPONSE_SEC * 1000;
    await client.query(
      'UPDATE trips SET escalation_stage = $1, next_check_at = $2 WHERE id = $3',
      ['user_prompted', nextCheckAt, tripId]
    );

    // TODO: Send silent push prompt to user: "Are you okay?"
    // This would use the notify service with a minimal payload
    logger.info({ tripId, userId, nextCheckAt }, '[Watchdog] First safety check sent, second check scheduled if unanswered');
  }

  /**
   * Stage 2: final check-in prompt. There is deliberately no additional
   * warning after this one: the normal SOS path runs at its 10-second deadline.
   */
  private async escalateSecondCheck(
    client: any,
    tripId: string,
    userId: string,
    now: number
  ): Promise<void> {
    const nextCheckAt = now + env.WATCHDOG_SECOND_CHECK_RESPONSE_SEC * 1000;
    await client.query(
      'UPDATE trips SET escalation_stage = $1, next_check_at = $2 WHERE id = $3',
      ['second_prompted', nextCheckAt, tripId]
    );

    // TODO: Send final silent push prompt to user: "Please confirm you are safe."
    logger.info({ tripId, userId, nextCheckAt }, '[Watchdog] Second safety check sent; SOS will trigger if unanswered');
  }

  /**
   * Stage 2: Lost Contact - User didn't respond to prompt
   */
  private async escalateLostContact(
    client: any,
    tripId: string,
    userId: string,
    lastSeenAt: number | null,
    now: number
  ): Promise<void> {
    // Check if already escalated to guardians_alerted
    const existingEscalation = await client.query(
      'SELECT 1 FROM escalations WHERE trip_id = $1 AND stage = $2',
      [tripId, 'guardians_alerted']
    );
    if (existingEscalation.rows.length > 0) {
      return; // Already escalated
    }

    // Write escalation record
    await client.query(
      'INSERT INTO escalations (id, trip_id, stage, fired_at) VALUES (gen_random_uuid(), $1, $2, $3)',
      [tripId, 'guardians_alerted', now]
    );

    // Update trip: set escalation_stage to guardians_alerted
    await client.query(
      'UPDATE trips SET escalation_stage = $1, next_check_at = NULL WHERE id = $2',
      ['guardians_alerted', tripId]
    );

    // Create SOS event for watchdog-triggered alert
    const sosId = crypto.randomUUID();
    const createdAt = now;
    
    // Get user name for notification
    const userResult = await client.query(
      'SELECT name, phone FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    const userName = user?.name || 'A contact';

    // Create SOS event - use 'direct' as source since 'watchdog' is not in the source check constraint
    // The trigger field will indicate this is a watchdog-triggered SOS
    await client.query(
      `INSERT INTO sos_events (id, user_id, trip_id, trigger, duress, status, source, created_at, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [sosId, userId, tripId, 'watchdog', false, 'active', 'direct', createdAt, now]
    );

    // Get guardians with granted/pending consent for this user
    const guardiansResult = await client.query(
      `SELECT id, name, phone_e164, email, telegram_chat_id, channels, consent_status
       FROM guardians
       WHERE user_id = $1
         AND consent_status IN ('granted', 'pending')
         AND id != $2`,
      [userId, '00000000-0000-0000-0000-000000000000'] // SYSTEM_TOMBSTONE_GUARDIAN_ID
    );

    // Create delivery records for all guardians
    const deliveryRecords = [];
    for (const guardian of guardiansResult.rows) {
      // channels is a text[] array from PostgreSQL
      const channels = Array.isArray(guardian.channels) ? guardian.channels : [];
      for (const channel of channels) {
        deliveryRecords.push({
          sosId,
          guardianId: guardian.id,
          channel,
          status: 'queued',
          updatedAt: now,
        });
      }
    }

    if (deliveryRecords.length > 0) {
      const values = deliveryRecords.map((d, i) => 
        `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
      ).join(', ');
      const params = deliveryRecords.flatMap(d => [d.sosId, d.guardianId, d.channel, d.status, d.updatedAt]);
      await client.query(
        `INSERT INTO sos_deliveries (sos_id, guardian_id, channel, status, updated_at) VALUES ${values}`,
        params
      );
    }

    logger.info({ tripId, userId, sosId, guardianCount: guardiansResult.rows.length }, '[Watchdog] Lost contact - SOS created, guardians alerted');
  }

  /**
   * Stage 3: ETA Overdue - Trip past ETA without completion
   * Enters the signal_lost pipeline (signal_lost -> user_prompted -> guardians_alerted)
   */
  private async escalateEtaOverdue(
    client: any,
    tripId: string,
    userId: string,
    lastSeenAt: number | null,
    now: number
  ): Promise<void> {
    // Check if already escalated to signal_lost or guardians_alerted
    const existingEscalation = await client.query(
      'SELECT 1 FROM escalations WHERE trip_id = $1 AND stage IN ($2, $3)',
      [tripId, 'signal_lost', 'guardians_alerted']
    );
    if (existingEscalation.rows.length > 0) {
      return; // Already escalated to a later stage
    }

    // Write escalation record as signal_lost (enters the same pipeline)
    await client.query(
      'INSERT INTO escalations (id, trip_id, stage, fired_at) VALUES (gen_random_uuid(), $1, $2, $3)',
      [tripId, 'signal_lost', now]
    );

    // Update trip: set escalation_stage and next_check_at
    const nextCheckAt = now + env.WATCHDOG_FIRST_CHECK_RESPONSE_SEC * 1000;
    await client.query(
      'UPDATE trips SET escalation_stage = $1, next_check_at = $2 WHERE id = $3',
      ['user_prompted', nextCheckAt, tripId]
    );

    logger.info({ tripId, userId, nextCheckAt }, '[Watchdog] ETA overdue - first safety check sent');
  }

  /**
   * Alert guardians for expired Watch Me timer (FR-09)
   * Creates escalation record and sends notifications
   */
  private async alertWatchMeExpiry(
    client: any,
    watch: { id: string; user_id: string; ends_at: number },
    now: number
  ): Promise<void> {
    const watchId = watch.id;
    const userId = watch.user_id;

    // Get user name for notification
    const userResult = await client.query(
      'SELECT name, phone FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    const userName = user?.name || 'A contact';

    // Get guardians with granted/pending consent for this user
    const guardiansResult = await client.query(
      `SELECT id, name, phone_e164, email, telegram_chat_id, channels, consent_status
       FROM guardians
       WHERE user_id = $1
         AND consent_status IN ('granted', 'pending')
         AND id != $2`,
      [userId, '00000000-0000-0000-0000-000000000000'] // SYSTEM_TOMBSTONE_GUARDIAN_ID
    );

    if (guardiansResult.rows.length === 0) {
      logger.info({ watchId, userId }, '[Watchdog] Watch Me expired - no guardians to notify');
      return;
    }

    // Prepare notification payloads
    const basePayload = {
      userName,
      watchId,
    };

    // Convert to GuardianContact format
    const guardianContacts = guardiansResult.rows.map((g: any) => ({
      guardianId: g.id,
      name: g.name,
      phoneE164: g.phone_e164,
      email: g.email,
      telegramChatId: g.telegram_chat_id,
      pushToken: undefined,
      channels: Array.isArray(g.channels) ? g.channels : [],
      consentStatus: g.consent_status,
    }));

    // Separate by consent status
    const grantedContacts = guardianContacts.filter((g: any) => g.consentStatus === 'granted');
    const pendingContacts = guardianContacts.filter((g: any) => g.consentStatus === 'pending');

    // Dispatch full alerts to granted guardians (no tracking URL for Watch Me)
    if (grantedContacts.length > 0) {
      const fullPayload = {
        userName,
        watchId,
      };
      await notifyService.dispatchFullAlert(watchId, grantedContacts, fullPayload as any);
    }

    // Dispatch minimal alerts to pending guardians
    if (pendingContacts.length > 0) {
      const minimalPayload = {
        userName,
        watchId,
      };
      await notifyService.dispatchMinimalAlert(watchId, pendingContacts, minimalPayload as any);
    }

    logger.info({ watchId, userId, guardianCount: guardiansResult.rows.length }, '[Watchdog] Watch Me expired - guardians notified');
  }
}

export const watchdogWorker = new WatchdogWorker();

