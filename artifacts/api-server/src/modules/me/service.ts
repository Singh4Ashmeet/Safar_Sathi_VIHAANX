import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  users,
  guardians,
  trips,
  watchTimers,
  sosEvents,
  sosDeliveries,
  sosAcks,
  shareLinks,
  auditLog,
  SYSTEM_TOMBSTONE_USER_ID,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
} from '@workspace/db';
import { AppError } from '../../lib/errors.js';
import { userAdvisoryLockSql, withTransactionRetry } from '../../lib/lock.js';
import { cleanupFirebaseUser } from '../../middleware/auth.js';
import type { UpsertMeInput } from './validation.js';
import { base64ToBytes, epochDayFromUnixSec, hexToBytes } from '@workspace/safety-core';
import { env } from '../../config/env.js';

export interface UserProfileResponse {
  id: string;
  name: string;
  phone: string;
  lang: string;
  boxPub: string;
  signPub: string;
  expoPushToken: string | null;
  adultConfirmedAt: number | null;
  createdAt: number;
}

/**
 * Service for User Profile & Settings (FR-01, FR-14)
 */
export class MeService {
  /**
   * FR-01: GET /me - Read profile and settings
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot be used as user accounts');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found. Please complete profile setup.');
    }

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      lang: user.lang,
      boxPub: user.boxPub,
      signPub: user.signPub,
      expoPushToken: user.expoPushToken ?? null,
      adultConfirmedAt: user.adultConfirmedAt ?? null,
      createdAt: user.createdAt,
    };
  }

  /**
   * FR-01: PUT /me - Upsert user profile: name, phone, push token, public keys, language
   *
   * Concurrency & Resurrection Prevention:
   * 1. Rejects reserved system identities (system_*).
   * 2. Acquires transaction-scoped advisory lock for the user ID.
   * 3. Checks audit_log for an immutable 'user.delete' marker.
   *    If found, rejects with 403 ACCOUNT_DELETED to prevent resurrection.
   * 4. Executes atomic insert / onConflictDoUpdate inside the locked transaction.
   */
  async upsertProfile(userId: string, data: UpsertMeInput): Promise<UserProfileResponse> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot be used as user accounts');
    }

    return await withTransactionRetry(async () => {
      return await db.transaction(async (tx) => {
        // 1. Mandatory transaction-scoped advisory lock keyed deterministically by Firebase UID
        await tx.execute(userAdvisoryLockSql(userId));

        // 2. Audit marker lookup after acquiring the lock
        const [deletedAudit] = await tx
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(and(eq(auditLog.actor, userId), eq(auditLog.action, 'user.delete')))
          .limit(1);

        if (deletedAudit) {
          throw new AppError(403, 'ACCOUNT_DELETED', 'This account has been deleted and cannot be recreated.');
        }

        // 3. Profile insertion/upsert before releasing the transaction lock
        const now = Date.now();

        const updateSet: Record<string, unknown> = {
          name: data.name,
          phone: data.phone,
          lang: data.lang,
          boxPub: data.boxPub,
          signPub: data.signPub,
        };

        if (data.expoPushToken !== undefined) {
          updateSet.expoPushToken = data.expoPushToken;
        }
        if (data.adultConfirmedAt !== undefined) {
          updateSet.adultConfirmedAt = data.adultConfirmedAt;
        }

        const [user] = await tx
          .insert(users)
          .values({
            id: userId,
            name: data.name,
            phone: data.phone,
            lang: data.lang,
            boxPub: data.boxPub,
            signPub: data.signPub,
            expoPushToken: data.expoPushToken ?? null,
            adultConfirmedAt: data.adultConfirmedAt ?? null,
            createdAt: now,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: updateSet,
          })
          .returning();

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          lang: user.lang,
          boxPub: user.boxPub,
          signPub: user.signPub,
          expoPushToken: user.expoPushToken ?? null,
          adultConfirmedAt: user.adultConfirmedAt ?? null,
          createdAt: user.createdAt,
        };
      });
    });
  }

  /**
   * FR-14: DELETE /me - Delete account, purge personal data, and preserve forensic SOS records (DPDP Act 2023 compliance)
   *
   * Transaction Sequence:
   * 1. Acquire transaction-scoped advisory lock for the user ID.
   * 2. Check for existing 'user.delete' audit marker.
   * 3. If marker exists and original user absent, treat deletion as already done and allow Firebase cleanup retry.
   * 4. Lock user's trips in deterministic ID order (trips ORDER BY id FOR UPDATE).
   * 5. Lock user's watch timers in deterministic ID order (watch_timers ORDER BY id FOR UPDATE).
   * 6. Lock user's row (users FOR UPDATE). If not found, throw 404 USER_NOT_FOUND.
   * 7. Ensure system tombstones exist idempotently (users and guardians).
   * 8. Delete all SOS share links associated with the user's SOS events (including guardian_id IS NULL).
   * 9. Reassign SOS deliveries guardian_id to SYSTEM_TOMBSTONE_GUARDIAN_ID.
   * 10. Reassign SOS acknowledgments guardian_id to SYSTEM_TOMBSTONE_GUARDIAN_ID.
   * 11. Reassign user's SOS events user_id to SYSTEM_TOMBSTONE_USER_ID.
   * 12. Insert immutable 'user.delete' audit entry with actor: userId.
   * 13. Delete original user row (cascades to guardians, trips, trip_points, watch_timers, escalations, rides).
   * 14. Transaction commits.
   * 15. Attempt Firebase Admin deleteUser / disable fallback.
   * 16. Return { ok: true }.
   */
  async deleteAccount(userId: string): Promise<{ ok: boolean }> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot be deleted');
    }

    await withTransactionRetry(async () => {
      await db.transaction(async (tx) => {
        // 1. Acquire UID transaction-scoped advisory lock
        await tx.execute(userAdvisoryLockSql(userId));

        // 2. Check whether user.delete audit marker already exists
        const [existingDeleteAudit] = await tx
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(and(eq(auditLog.actor, userId), eq(auditLog.action, 'user.delete')))
          .limit(1);

        // Check if original user row exists
        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // 3. If marker exists and user row already gone, treat as already completed
        if (existingDeleteAudit && !existingUser) {
          return;
        }

        if (!existingUser) {
          throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found');
        }

        // 4. Lock user's trips in deterministic ID order
        await tx
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.userId, userId))
          .orderBy(trips.id)
          .for('update');

        // 5. Lock user's watch timers in deterministic ID order
        await tx
          .select({ id: watchTimers.id })
          .from(watchTimers)
          .where(eq(watchTimers.userId, userId))
          .orderBy(watchTimers.id)
          .for('update');

        // 6. Lock the user's row
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        // 7. Ensure both tombstone records exist using idempotent insertion
        await tx
          .insert(users)
          .values({
            id: SYSTEM_TOMBSTONE_USER_ID,
            name: '[DELETED USER]',
            phone: '+000000000000',
            lang: 'en',
            boxPub: 'DELETED_KEY',
            signPub: 'DELETED_KEY',
            expoPushToken: null,
            adultConfirmedAt: null,
            createdAt: 0,
          })
          .onConflictDoNothing({ target: users.id });

        await tx
          .insert(guardians)
          .values({
            id: SYSTEM_TOMBSTONE_GUARDIAN_ID,
            userId: SYSTEM_TOMBSTONE_USER_ID,
            name: '[DELETED GUARDIAN]',
            phoneE164: '+000000000000',
            email: null,
            relationship: 'anonymized',
            channels: ['sms'],
            telegramChatId: null,
            consentStatus: 'revoked',
            guardianUserId: null,
            createdAt: 0,
          })
          .onConflictDoNothing({ target: guardians.id });

        // 8. Delete every share link associated with the user's SOS events (including guardian_id IS NULL)
        await tx.execute(sql`
          DELETE FROM share_links
          WHERE sos_id IN (
            SELECT id FROM sos_events WHERE user_id = ${userId}
          )
        `);

        // 9. Reassign SOS deliveries guardian references to SYSTEM_TOMBSTONE_GUARDIAN_ID
        await tx.execute(sql`
          UPDATE sos_deliveries
          SET guardian_id = ${SYSTEM_TOMBSTONE_GUARDIAN_ID}
          WHERE sos_id IN (
            SELECT id FROM sos_events WHERE user_id = ${userId}
          )
        `);

        // 10. Reassign SOS acknowledgments guardian references to SYSTEM_TOMBSTONE_GUARDIAN_ID
        await tx.execute(sql`
          UPDATE sos_acks
          SET guardian_id = ${SYSTEM_TOMBSTONE_GUARDIAN_ID}
          WHERE sos_id IN (
            SELECT id FROM sos_events WHERE user_id = ${userId}
          )
        `);

        // 11. Reassign the user's SOS events to SYSTEM_TOMBSTONE_USER_ID
        await tx
          .update(sosEvents)
          .set({ userId: SYSTEM_TOMBSTONE_USER_ID })
          .where(eq(sosEvents.userId, userId));

        // 12. Insert the immutable user.delete audit entry using original Firebase UID as actor
        await tx.insert(auditLog).values({
          actor: userId,
          action: 'user.delete',
          resource: 'users',
          ts: Date.now(),
        });

        // 13. Delete original user row (cascades to guardians, trips, trip_points, watch_timers, escalations, rides)
        await tx.delete(users).where(eq(users.id, userId));
      });
    });

    // 14 & 15. Attempt Firebase Admin user cleanup after database transaction commits
    await cleanupFirebaseUser(userId);

    return { ok: true };
  }

  /**
   * FR-12: GET /me/relay-bundle - Server public key, epoch tags, TTL policy for offline BLE relay
   */
  async getRelayBundle(userId: string): Promise<{
    serverBoxPublicKey: string;
    epoch: number;
    destTagForGateway: string;
    ttlStart: number;
    maxAgeSec: number;
    minAppVersion: string;
  }> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot use relay');
    }

    const [deletedAudit] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.actor, userId), eq(auditLog.action, 'user.delete')))
      .limit(1);
    if (deletedAudit) {
      throw new AppError(403, 'ACCOUNT_DELETED', 'Deleted accounts cannot obtain relay credentials');
    }

    const [user] = await db.select({ id: users.id, signPub: users.signPub }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found');

    const serverPublicKey = validBase64Key(env.SERVER_BOX_PUBLIC_KEY, 'SERVER_BOX_PUBLIC_KEY');
    validBase64Key(env.SERVER_BOX_SECRET_KEY, 'SERVER_BOX_SECRET_KEY');
    const destinationTag = validHexTag(env.RELAY_DEST_TAG);
    // A relay bundle is useful only for a registered sender key. This check is
    // intentionally scoped to relay provisioning so legacy profile fixtures do
    // not change the existing PUT /me behavior.
    validBase64Key(user.signPub, 'signPub');

    return {
      serverBoxPublicKey: serverPublicKey,
      epoch: epochDayFromUnixSec(Math.floor(Date.now() / 1000)),
      destTagForGateway: destinationTag,
      ttlStart: 10,
      maxAgeSec: env.RELAY_MAX_AGE_SEC,
      minAppVersion: '2.0.0',
    };
  }
}

function validBase64Key(value: string, field: string): string {
  let bytes: Uint8Array;
  try { bytes = base64ToBytes(value); } catch { throw new AppError(503, 'RELAY_NOT_CONFIGURED', `${field} is not configured`); }
  if (bytes.length !== 32) throw new AppError(503, 'RELAY_NOT_CONFIGURED', `${field} is not configured`);
  return value;
}

function validHexTag(value: string): string {
  try {
    if (hexToBytes(value).length !== 8) throw new Error('length');
  } catch {
    throw new AppError(503, 'RELAY_NOT_CONFIGURED', 'RELAY_DEST_TAG is not configured');
  }
  return value.toLowerCase();
}

export const meService = new MeService();
