import {
  db,
  users,
  trips,
  tripPoints,
  guardians,
  sosEvents,
  sosDeliveries,
  sosAcks,
  shareLinks,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
} from '@workspace/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { userAdvisoryLockSql, withTransactionRetry } from '../../lib/lock.js';
import { notifyService } from '../notify/index.js';
import { NOTIFICATION_TEMPLATES, type NotificationPayload, type MinimalNotificationPayload } from '../notify/templates.js';
import { trackingBroadcaster } from '../public/liveTracking.js';
import type { CreateSosInput } from './validation.js';
import type { CreateSosResult, GuardianDeliveryItem } from '@workspace/api-zod';
import crypto from 'node:crypto';

/**
 * Service for SOS triggers (FR-06)
 * Implements idempotent SOS creation with durable delivery records
 */
export class SosService {
  /**
   * FR-06: POST /sos - Create SOS (client UUID), idempotent
   * - Validates ownership of optional tripId
   * - Resolves guardians with consentStatus = 'granted' (full alert) or 'pending' (minimal alert)
   * - Creates durable delivery records before dispatch
   * - Dispatches notifications and updates delivery outcomes
   */
  async createSos(
    userId: string,
    data: CreateSosInput,
    provenance?: { source: 'ble_gateway'; gatewayDeviceHash?: string | null }
  ): Promise<CreateSosResult> {
    let trackingToken: string | undefined;
    const trackingTokens = new Map<string, string>();
    // Validate optional tripId ownership
    if (data.tripId) {
      const [trip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, data.tripId), eq(trips.userId, userId)))
        .limit(1);

      if (!trip) {
        throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found or access denied');
      }
    }

    // Get user name for notification
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found');
    }

    // Get all non-revoked, non-tombstone guardians for this user
    const allGuardians = await db
      .select()
      .from(guardians)
      .where(
        and(
          eq(guardians.userId, userId),
          sql`${guardians.consentStatus} IN ('granted', 'pending')`,
          sql`${guardians.id} != ${SYSTEM_TOMBSTONE_GUARDIAN_ID}`
        )
      );

    // Separate into granted (full alert) and pending (minimal alert)
    const grantedGuardians = allGuardians.filter(g => g.consentStatus === 'granted');
    const pendingGuardians = allGuardians.filter(g => g.consentStatus === 'pending');

    // Build GuardianContact arrays for notification dispatch
    const toGuardianContact = (g: typeof guardians.$inferSelect) => ({
      guardianId: g.id,
      name: g.name,
      phoneE164: g.phoneE164,
      email: g.email,
      telegramChatId: g.telegramChatId,
      pushToken: undefined,
      channels: g.channels as ('sms' | 'telegram' | 'email' | 'push')[],
      consentStatus: g.consentStatus as 'granted' | 'pending',
    });

    const grantedContacts = grantedGuardians.map(toGuardianContact);
    const pendingContacts = pendingGuardians.map(toGuardianContact);

    // Build notification payloads
    const basePayload = {
      userName: user.name || 'A contact',
      sosId: data.sosId,
    };

    // Use advisory lock for idempotent creation
    const result = await withTransactionRetry<CreateSosResult>(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user
        await tx.execute(userAdvisoryLockSql(userId));

        // Check if SOS already exists (idempotency check)
        const [existingSos] = await tx
          .select()
          .from(sosEvents)
          .where(eq(sosEvents.id, data.sosId))
          .limit(1);

        if (existingSos) {
          // Idempotent retry: verify ownership
          if (existingSos.userId !== userId) {
            throw new AppError(409, 'SOS_ID_CONFLICT', 'SOS ID already exists for a different user');
          }

          // For idempotent retries, return the current delivery status
          const existingDeliveries = await tx
            .select()
            .from(sosDeliveries)
            .where(eq(sosDeliveries.sosId, data.sosId));

          const guardianResults: GuardianDeliveryItem[] = existingDeliveries.map((d) => ({
            guardianId: d.guardianId,
            channel: d.channel as 'push' | 'sms' | 'telegram' | 'email',
            status: d.status as 'queued' | 'sent' | 'failed' | 'acknowledged',
            updatedAt: d.updatedAt,
          }));

          return {
            sosId: existingSos.id,
            status: existingSos.status as 'active' | 'acknowledged' | 'resolved' | 'cancelled',
            guardians: guardianResults,
          };
        }

        // Create new SOS event
        const now = Date.now();
        const [inserted] = await tx
          .insert(sosEvents)
          .values({
            id: data.sosId,
            userId,
            tripId: data.tripId ?? null,
            trigger: data.trigger,
            duress: data.duress,
            status: 'active',
            source: provenance?.source ?? 'direct',
            gatewayDeviceHash: provenance?.gatewayDeviceHash ?? null,
            lastLat: data.location?.lat ?? null,
            lastLng: data.location?.lng ?? null,
            locationAccuracyM: data.location?.acc ?? null,
            battery: data.battery ?? null,
            lastLocationAt: data.location?.ts ?? null,
            createdAt: data.createdAt,
            receivedAt: now,
          })
          .returning();

        const sosEvent = inserted;

        // Create pending delivery records for ALL guardians (granted + pending)
        const allGuardiansForDelivery = [...grantedGuardians, ...pendingGuardians];
        const deliveryRecords: typeof sosDeliveries.$inferInsert[] = [];
        for (const guardian of allGuardiansForDelivery) {
          for (const channel of guardian.channels) {
            deliveryRecords.push({
              sosId: data.sosId,
              guardianId: guardian.id,
              channel,
              status: 'queued',
              updatedAt: now,
            });
          }
        }

        if (deliveryRecords.length > 0) {
          await tx.insert(sosDeliveries).values(deliveryRecords);
        }

        // Each full-alert guardian receives a separate expiring token. Pending
        // and revoked-consent recipients never receive a tracking URL.
        for (const guardian of grantedGuardians) {
          const token = crypto.randomBytes(32).toString('hex');
          trackingTokens.set(guardian.id, token);
          trackingToken ??= token;
          await tx.insert(shareLinks).values({
            tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
            sosId: data.sosId,
            guardianId: guardian.id,
            expiresAt: now + 24 * 60 * 60 * 1000,
            revokedAt: null,
            createdAt: now,
          });
        }

        return {
          sosId: sosEvent.id,
          status: sosEvent.status as 'active' | 'acknowledged' | 'resolved' | 'cancelled',
          guardians: [] as GuardianDeliveryItem[],
        };
      });
    });

    // Dispatch notifications after successful commit
    const trackingUrl = trackingToken
      ? `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${trackingToken}`
      : `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${data.sosId}`;

    // Dispatch full alerts to granted guardians
    if (grantedContacts.length > 0) {
      const fullPayload = {
        userName: user.name || 'A contact',
        trackingUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${data.sosId}`,
        sosId: data.sosId,
      } as const;

      const fullDispatchResults = (await Promise.all(grantedContacts.map((guardian) =>
        notifyService.dispatchFullAlert(data.sosId, [guardian], {
          ...fullPayload,
          trackingUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${trackingTokens.get(guardian.guardianId) ?? data.sosId}`,
        })
      ))).flat();

      // Update delivery records with actual outcomes for granted guardians
      await withTransactionRetry(async () => {
        return db.transaction(async (tx) => {
          await tx.execute(userAdvisoryLockSql(userId));

          for (const dispatchResult of fullDispatchResults) {
            await tx
              .update(sosDeliveries)
              .set({
                status: dispatchResult.status === 'sent' ? 'sent' : 'failed',
                providerRef: dispatchResult.providerRef ?? null,
                updatedAt: Date.now(),
              })
              .where(
                and(
                  eq(sosDeliveries.sosId, data.sosId),
                  eq(sosDeliveries.guardianId, dispatchResult.guardianId),
                  eq(sosDeliveries.channel, dispatchResult.channel)
                )
              );
          }
        });
      });
    }

    // Dispatch minimal alerts to pending guardians
    if (pendingContacts.length > 0) {
      const minimalPayload = {
        userName: user.name || 'A contact',
        sosId: data.sosId,
      } as const;

      const minimalDispatchResults = await notifyService.dispatchMinimalAlert(
        data.sosId,
        pendingContacts,
        minimalPayload
      );

      // Update delivery records with actual outcomes for pending guardians
      await withTransactionRetry(async () => {
        return db.transaction(async (tx) => {
          await tx.execute(userAdvisoryLockSql(userId));

          for (const dispatchResult of minimalDispatchResults) {
            await tx
              .update(sosDeliveries)
              .set({
                status: dispatchResult.status === 'sent' ? 'sent' : 'failed',
                providerRef: dispatchResult.providerRef ?? null,
                updatedAt: Date.now(),
              })
              .where(
                and(
                  eq(sosDeliveries.sosId, data.sosId),
                  eq(sosDeliveries.guardianId, dispatchResult.guardianId),
                  eq(sosDeliveries.channel, dispatchResult.channel)
                )
              );
          }
        });
      });
    }

    // Build final response with delivery status
    const finalDeliveries = await db
      .select()
      .from(sosDeliveries)
      .where(eq(sosDeliveries.sosId, data.sosId));

    const guardianResults: GuardianDeliveryItem[] = finalDeliveries.map((d) => ({
      guardianId: d.guardianId,
      channel: d.channel as 'push' | 'sms' | 'telegram' | 'email',
      status: d.status as 'queued' | 'sent' | 'failed' | 'acknowledged',
      updatedAt: d.updatedAt,
    }));

    logger.info(
      { userId, sosId: data.sosId, grantedCount: grantedContacts.length, pendingCount: pendingContacts.length },
      'SOS created and notifications dispatched'
    );

    return {
      sosId: data.sosId,
      status: 'active' as const,
      guardians: guardianResults,
    };
  }

  /**
   * FR-07: POST /sos/:id/cancel - Cancel SOS with pinKind (cancel | duress)
   * - pinKind=cancel: transition to cancelled state
   * - pinKind=duress: keep SOS active but mark duress=true, do not notify guardians
   */
  async cancelSos(userId: string, sosId: string, pinKind: 'cancel' | 'duress'): Promise<{ sosId: string; status: string }> {
    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user
        await tx.execute(userAdvisoryLockSql(userId));

        // Get the SOS event with FOR UPDATE to lock the row
        const [existingSos] = await tx
          .select()
          .from(sosEvents)
          .where(and(eq(sosEvents.id, sosId), eq(sosEvents.userId, userId)))
          .limit(1)
          .for('update');

        if (!existingSos) {
          throw new AppError(404, 'SOS_NOT_FOUND', 'SOS not found');
        }

        // Check current state
        if (existingSos.status === 'cancelled') {
          // Idempotent: already cancelled
          return { sosId: existingSos.id, status: 'cancelled' };
        }

        if (existingSos.status === 'resolved' || existingSos.status === 'acknowledged') {
          throw new AppError(409, 'INVALID_STATE_TRANSITION', `Cannot cancel SOS in ${existingSos.status} state`);
        }

        if (pinKind === 'cancel') {
          // Transition to cancelled
          await tx
            .update(sosEvents)
            .set({ status: 'cancelled' })
            .where(eq(sosEvents.id, sosId));

          logger.info({ userId, sosId }, 'SOS cancelled by owner');

          return { sosId, status: 'cancelled' };
        } else if (pinKind === 'duress') {
          // Duress: keep SOS active but mark duress=true, do not notify guardians
          await tx
            .update(sosEvents)
            .set({ duress: true, status: 'active' })
            .where(eq(sosEvents.id, sosId));

          logger.warn({ userId, sosId }, 'SOS duress activated by owner');

          return { sosId, status: 'active' };
        }

        // Should not reach here due to validation
        throw new AppError(400, 'INVALID_PIN_KIND', 'Invalid pinKind');
      });
    });
  }

  /**
   * FR-08: POST /sos/:id/ack - Guardian acknowledge SOS
   * Supports token-based (share-link) acknowledgement.
   * Authenticated user path is also supported for guardian users.
   */
  async acknowledgeSos(sosId: string, guardianId?: string, token?: string, authenticatedUid?: string): Promise<{ ok: boolean }> {
    if (!guardianId && !token) {
      throw new AppError(400, 'MISSING_AUTH', 'Either guardianId or token must be provided');
    }

    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Find the SOS event
        const [sosEvent] = await tx
          .select()
          .from(sosEvents)
          .where(eq(sosEvents.id, sosId))
          .limit(1)
          .for('update');

        if (!sosEvent) {
          throw new AppError(404, 'SOS_NOT_FOUND', 'SOS not found');
        }

        // Check if SOS is in a state that can be acknowledged
        if (sosEvent.status !== 'active') {
          throw new AppError(409, 'INVALID_STATE', `Cannot acknowledge SOS in ${sosEvent.status} state`);
        }

        let guardian: typeof guardians.$inferSelect | null = null;

        if (token) {
          // Token-based acknowledgement (share-link)
          // Hash the token to match stored hash
          const crypto = await import('node:crypto');
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

          const [shareLink] = await tx
            .select()
            .from(shareLinks)
            .where(and(eq(shareLinks.sosId, sosId), eq(shareLinks.tokenHash, tokenHash)))
            .limit(1);

          if (!shareLink) {
            throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired acknowledgement token');
          }

          if (shareLink.revokedAt) {
            throw new AppError(401, 'TOKEN_REVOKED', 'Acknowledgement token has been revoked');
          }

          if (shareLink.expiresAt && shareLink.expiresAt < Date.now()) {
            throw new AppError(401, 'TOKEN_EXPIRED', 'Acknowledgement token has expired');
          }

          // Get guardian from share link
          if (!shareLink.guardianId) {
            throw new AppError(401, 'INVALID_TOKEN', 'Invalid acknowledgement token');
          }
          const [g] = await tx
            .select()
            .from(guardians)
            .where(eq(guardians.id, shareLink.guardianId))
            .limit(1);

          if (!g) {
            throw new AppError(401, 'INVALID_TOKEN', 'Invalid acknowledgement token');
          }

          // Check for tombstone guardian
          if (g.id === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
            throw new AppError(403, 'FORBIDDEN', 'System tombstone guardian cannot acknowledge');
          }

          // Check if guardian is revoked
          if (g.consentStatus === 'revoked') {
            throw new AppError(403, 'FORBIDDEN', 'Guardian consent revoked');
          }

          guardian = g;
        } else if (guardianId) {
          // Guardian ID provided - need to verify ownership and that authenticated user matches guardianUserId
          if (!authenticatedUid) {
            throw new AppError(401, 'UNAUTHORIZED', 'Authentication required for guardian ID acknowledgement');
          }

          const [g] = await tx
            .select()
            .from(guardians)
            .where(eq(guardians.id, guardianId))
            .limit(1);

          if (!g) {
            throw new AppError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found');
          }

          // Check if guardian belongs to the SOS owner
          if (g.userId !== sosEvent.userId) {
            throw new AppError(403, 'FORBIDDEN', 'Guardian does not belong to SOS owner');
          }

          // Check for tombstone guardian
          if (g.id === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
            throw new AppError(403, 'FORBIDDEN', 'System tombstone guardian cannot acknowledge');
          }

          // Check if guardian is revoked
          if (g.consentStatus === 'revoked') {
            throw new AppError(403, 'FORBIDDEN', 'Guardian consent revoked');
          }

          // CRITICAL: Verify that the authenticated user matches the guardian's user ID
          if (g.guardianUserId !== authenticatedUid) {
            throw new AppError(403, 'FORBIDDEN', 'Authenticated user does not match guardian');
          }

          guardian = g;
        }

        if (!guardian) {
          throw new AppError(401, 'UNAUTHORIZED', 'Unable to verify guardian');
        }

        // Check if already acknowledged by this guardian
        const [existingAck] = await tx
          .select()
          .from(sosAcks)
          .where(and(eq(sosAcks.sosId, sosId), eq(sosAcks.guardianId, guardian.id)))
          .limit(1);

        if (existingAck) {
          // Idempotent: already acknowledged
          return { ok: true };
        }

        // Insert acknowledgement record
        await tx.insert(sosAcks).values({
          id: crypto.randomUUID(),
          sosId,
          guardianId: guardian.id,
          ackAt: Date.now(),
        });

        // Update delivery status for this guardian to 'acknowledged'
        await tx
          .update(sosDeliveries)
          .set({
            status: 'acknowledged',
            updatedAt: Date.now(),
          })
          .where(and(eq(sosDeliveries.sosId, sosId), eq(sosDeliveries.guardianId, guardian.id)));

        // Check if all ELIGIBLE guardian deliveries are acknowledged to transition SOS status
        // Only count deliveries for non-tombstone, non-revoked guardians with granted/pending consent
        const [eligibleDeliveries] = await tx
          .select({ count: sql`count(*)` })
          .from(sosDeliveries)
          .innerJoin(guardians, eq(sosDeliveries.guardianId, guardians.id))
          .where(
            and(
              eq(sosDeliveries.sosId, sosId),
              sql`${guardians.consentStatus} IN ('granted', 'pending')`,
              sql`${guardians.id} != ${SYSTEM_TOMBSTONE_GUARDIAN_ID}`
            )
          );

        const [unacknowledged] = await tx
          .select({ count: sql`count(*)` })
          .from(sosDeliveries)
          .innerJoin(guardians, eq(sosDeliveries.guardianId, guardians.id))
          .where(
            and(
              eq(sosDeliveries.sosId, sosId),
              sql`sos_deliveries.status != 'acknowledged'`,
              sql`${guardians.consentStatus} IN ('granted', 'pending')`,
              sql`${guardians.id} != ${SYSTEM_TOMBSTONE_GUARDIAN_ID}`
            )
          );

        // Only transition to acknowledged if there is at least one eligible delivery
        // and all eligible deliveries are acknowledged
        if (Number(eligibleDeliveries?.count || 0) > 0 && Number(unacknowledged?.count || 0) === 0) {
          await tx
            .update(sosEvents)
            .set({ status: 'acknowledged' })
            .where(eq(sosEvents.id, sosId));
        }

        logger.info({ sosId, guardianId: guardian.id }, 'SOS acknowledged by guardian');

        return { ok: true };
      });
    });
  }

  /**
   * Recover and dispatch queued deliveries for an SOS that was created but not fully dispatched.
   * This can be called on server startup or via a scheduled job to handle server crashes
   * that occurred after SOS commit but before notification dispatch.
   */
  async recoverUndispatchedDeliveries(sosId: string): Promise<void> {
    // Find all queued deliveries for this SOS
    const queuedDeliveries = await db
      .select()
      .from(sosDeliveries)
      .where(and(eq(sosDeliveries.sosId, sosId), eq(sosDeliveries.status, 'queued')));

    if (queuedDeliveries.length === 0) {
      return;
    }

    // Get the SOS event to find the owner
    const [sosEvent] = await db
      .select()
      .from(sosEvents)
      .where(eq(sosEvents.id, sosId))
      .limit(1);

    if (!sosEvent) {
      logger.warn({ sosId }, 'SOS event not found for delivery recovery');
      return;
    }

    // Get user name
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, sosEvent.userId))
      .limit(1);

    if (!user) {
      logger.warn({ sosId, userId: sosEvent.userId }, 'User not found for delivery recovery');
      return;
    }

    // Get guardian details for queued deliveries
    const guardianIds = [...new Set(queuedDeliveries.map(d => d.guardianId))];
    const guardianDetails = await db
      .select()
      .from(guardians)
      .where(inArray(guardians.id, guardianIds));

    const guardianMap = new Map(guardianDetails.map(g => [g.id, g]));

    // Group by consent status
    const grantedContacts: Array<{
      guardianId: string;
      name: string;
      phoneE164: string;
      email?: string | null;
      telegramChatId?: string | null;
      pushToken?: string | null;
      channels: string[];
      consentStatus: 'granted' | 'pending';
    }> = [];
    const pendingContacts: Array<{
      guardianId: string;
      name: string;
      phoneE164: string;
      email?: string | null;
      telegramChatId?: string | null;
      pushToken?: string | null;
      channels: string[];
      consentStatus: 'granted' | 'pending';
    }> = [];

    for (const delivery of queuedDeliveries) {
      const guardian = guardianMap.get(delivery.guardianId);
      if (!guardian) continue;

      const contact = {
        guardianId: guardian.id,
        name: guardian.name,
        phoneE164: guardian.phoneE164,
        email: guardian.email,
        telegramChatId: guardian.telegramChatId,
        pushToken: undefined,
        channels: guardian.channels as ('sms' | 'telegram' | 'email' | 'push')[],
        consentStatus: guardian.consentStatus as 'granted' | 'pending',
      };

      if (guardian.consentStatus === 'granted') {
        grantedContacts.push(contact);
      } else if (guardian.consentStatus === 'pending') {
        pendingContacts.push(contact);
      }
    }

    const userName = user.name || 'A contact';
    const trackingUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${sosId}`;

    // Dispatch to granted guardians
    if (grantedContacts.length > 0) {
      const fullPayload = {
        userName,
        trackingUrl,
        sosId,
      };

      const results = await notifyService.dispatchFullAlert(sosId, grantedContacts, fullPayload);

      await withTransactionRetry(async () => {
        return db.transaction(async (tx) => {
          await tx.execute(userAdvisoryLockSql(sosEvent.userId));
          for (const result of results) {
            await tx
              .update(sosDeliveries)
              .set({
                status: result.status === 'sent' ? 'sent' : 'failed',
                providerRef: result.providerRef ?? null,
                updatedAt: Date.now(),
              })
              .where(
                and(
                  eq(sosDeliveries.sosId, sosId),
                  eq(sosDeliveries.guardianId, result.guardianId),
                  eq(sosDeliveries.channel, result.channel)
                )
              );
          }
        });
      });
    }

    // Dispatch to pending guardians
    if (pendingContacts.length > 0) {
      const minimalPayload = {
        userName,
        sosId,
      };

      const results = await notifyService.dispatchMinimalAlert(sosId, pendingContacts, minimalPayload);

      await withTransactionRetry(async () => {
        return db.transaction(async (tx) => {
          await tx.execute(userAdvisoryLockSql(sosEvent.userId));
          for (const result of results) {
            await tx
              .update(sosDeliveries)
              .set({
                status: result.status === 'sent' ? 'sent' : 'failed',
                providerRef: result.providerRef ?? null,
                updatedAt: Date.now(),
              })
              .where(
                and(
                  eq(sosDeliveries.sosId, sosId),
                  eq(sosDeliveries.guardianId, result.guardianId),
                  eq(sosDeliveries.channel, result.channel)
                )
              );
          }
        });
      });
    }

    logger.info({ sosId, recoveredCount: queuedDeliveries.length }, 'Recovered undispatched deliveries');
  }

  /**
   * FR-06: POST /sos/:id/locations - Ingest real-time locations during active SOS
   * Updates current SOS coordinates and broadcasts live location to guardians via SSE
   */
  async ingestLocations(
    userId: string,
    sosId: string,
    points: { lat: number; lng: number; acc?: number; ts: number; mocked?: boolean }[]
  ): Promise<{ accepted: number; lastSeenAt: number }> {
    const [sos] = await db
      .select({
        id: sosEvents.id,
        userId: sosEvents.userId,
        tripId: sosEvents.tripId,
        status: sosEvents.status,
        lastLocationAt: sosEvents.lastLocationAt,
        receivedAt: sosEvents.receivedAt,
      })
      .from(sosEvents)
      .where(and(eq(sosEvents.id, sosId), eq(sosEvents.userId, userId)))
      .limit(1);

    if (!sos) {
      throw new AppError(404, 'SOS_NOT_FOUND', 'SOS event not found or access denied');
    }

    if (sos.status !== 'active' && sos.status !== 'acknowledged') {
      throw new AppError(409, 'INVALID_SOS_STATE', `Cannot ingest locations for SOS in ${sos.status} state`);
    }

    const now = Date.now();
    const validPoints = points
      .filter((p) => p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180 && p.ts > 0 && p.ts <= now + 60_000)
      .sort((a, b) => a.ts - b.ts);

    if (validPoints.length === 0) {
      throw new AppError(400, 'INVALID_POINTS', 'No valid location points in batch');
    }

    const latestPoint = validPoints[validPoints.length - 1];

    await db
      .update(sosEvents)
      .set({
        lastLat: latestPoint.lat,
        lastLng: latestPoint.lng,
        locationAccuracyM: latestPoint.acc ?? null,
        lastLocationAt: latestPoint.ts,
      })
      .where(eq(sosEvents.id, sosId));

    // If linked to trip, also insert into tripPoints and update trip position
    if (sos.tripId) {
      for (const pt of validPoints) {
        await db
          .insert(tripPoints)
          .values({
            tripId: sos.tripId,
            ts: pt.ts,
            lat: pt.lat,
            lng: pt.lng,
            acc: pt.acc ?? null,
          })
          .onConflictDoNothing();
      }
      await db
        .update(trips)
        .set({
          lastLat: latestPoint.lat,
          lastLng: latestPoint.lng,
          lastSeenAt: latestPoint.ts,
        })
        .where(eq(trips.id, sos.tripId));

      trackingBroadcaster.broadcast(sos.tripId, {
        lastLat: latestPoint.lat,
        lastLng: latestPoint.lng,
        lastSeenAt: latestPoint.ts,
        tripStatus: `sos_${sos.status}`,
        accuracyM: latestPoint.acc,
      });
    }

    // Broadcast live event to all guardians tracking this SOS
    trackingBroadcaster.broadcast(sosId, {
      lastLat: latestPoint.lat,
      lastLng: latestPoint.lng,
      lastSeenAt: latestPoint.ts,
      tripStatus: `sos_${sos.status}`,
      accuracyM: latestPoint.acc,
    });

    logger.info({ userId, sosId, accepted: validPoints.length }, 'SOS location batch ingested & broadcasted');
    return { accepted: validPoints.length, lastSeenAt: latestPoint.ts };
  }

  /**
   * FR-08: GET /sos/:id - Get SOS status with per-guardian, per-channel deliveries
   */
  async getSosStatus(userId: string, sosId: string): Promise<{
    sosId: string;
    status: 'active' | 'acknowledged' | 'resolved' | 'cancelled';
    source: 'direct' | 'ble_gateway';
    createdAt: number;
    deliveries: {
      guardianId: string;
      channel: 'push' | 'sms' | 'telegram' | 'email';
      status: 'queued' | 'sent' | 'failed' | 'acknowledged';
      updatedAt: number;
    }[];
  }> {
    const [sos] = await db
      .select()
      .from(sosEvents)
      .where(and(eq(sosEvents.id, sosId), eq(sosEvents.userId, userId)))
      .limit(1);

    if (!sos) {
      throw new AppError(404, 'SOS_NOT_FOUND', 'SOS event not found or access denied');
    }

    const deliveries = await db
      .select()
      .from(sosDeliveries)
      .where(eq(sosDeliveries.sosId, sosId));

    return {
      sosId: sos.id,
      status: sos.status as 'active' | 'acknowledged' | 'resolved' | 'cancelled',
      source: (sos.source as 'direct' | 'ble_gateway') || 'direct',
      createdAt: sos.createdAt,
      deliveries: deliveries.map((d) => ({
        guardianId: d.guardianId,
        channel: d.channel as 'push' | 'sms' | 'telegram' | 'email',
        status: d.status as 'queued' | 'sent' | 'failed' | 'acknowledged',
        updatedAt: d.updatedAt,
      })),
    };
  }
}

export const sosService = new SosService();
