import crypto from 'node:crypto';
import {
  db,
  users,
  guardians,
  shareLinks,
  sosDeliveries,
  sosAcks,
  auditLog,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
  SYSTEM_TOMBSTONE_USER_ID,
} from '@workspace/db';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { userAdvisoryLockSql, withTransactionRetry } from '../../lib/lock.js';
import { consoleSmsProvider } from '../notify/providers/sms/consoleProvider.js';
import { androidGatewayProvider } from '../notify/providers/sms/androidGatewayProvider.js';
import type { SmsProvider } from '../notify/providers/sms/SmsProvider.js';
import type { AddGuardianInput } from './validation.js';
import type { Guardian, AddGuardianResult, OkResponse } from '@workspace/api-zod';

/**
 * Service for Guardian Circle & Consent Management (FR-02, FR-14, FR-15, FR-19)
 */
export class GuardiansService {
  private readonly smsProvider: SmsProvider;

  constructor() {
    this.smsProvider =
      env.SMS_PROVIDER === 'android-gateway'
        ? androidGatewayProvider
        : consoleSmsProvider;
  }

  /**
   * FR-02: GET /guardians - List guardians with consent status and channels.
   * Scoped exclusively by req.user.uid. Never exposes tombstone records or secrets.
   */
  async listGuardians(userId: string): Promise<Guardian[]> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot access guardians');
    }

    const rows = await db
      .select()
      .from(guardians)
      .where(
        and(
          eq(guardians.userId, userId),
          sql`${guardians.id} != ${SYSTEM_TOMBSTONE_GUARDIAN_ID}`
        )
      )
      .orderBy(guardians.createdAt);

    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      phoneE164: g.phoneE164,
      email: g.email ?? null,
      relationship: g.relationship,
      channels: g.channels as ('sms' | 'telegram' | 'email')[],
      consentStatus: g.consentStatus as 'pending' | 'granted' | 'revoked',
      createdAt: g.createdAt,
    }));
  }

  /**
   * FR-02, FR-19: POST /guardians - Add guardian (2-5 per user) with concurrency-safe limits.
   * Sets consentStatus = 'pending' and dispatches invitation notification.
   */
  async addGuardian(userId: string, data: AddGuardianInput): Promise<AddGuardianResult> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot add guardians');
    }

    const normalizedPhone = data.phoneE164.trim();

    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // 1. Transaction-scoped user advisory lock serializes concurrent guardian additions
        await tx.execute(userAdvisoryLockSql(userId));

        // 2. Check if account was deleted (audit marker)
        const [deleteMarker] = await tx
          .select({ actor: auditLog.actor })
          .from(auditLog)
          .where(and(eq(auditLog.actor, userId), eq(auditLog.action, 'user.delete')))
          .limit(1);

        if (deleteMarker) {
          throw new AppError(403, 'ACCOUNT_DELETED', 'Account has been deleted; cannot add guardians');
        }

        // 3. Verify user profile exists in database
        const [userRow] = await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, userId));

        if (!userRow) {
          throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found. Please create a profile first.');
        }

        // 4. Concurrency-safe limit check: maximum 5 guardians per user
        const existingGuardians = await tx
          .select()
          .from(guardians)
          .where(
            and(
              eq(guardians.userId, userId),
              sql`${guardians.id} != ${SYSTEM_TOMBSTONE_GUARDIAN_ID}`
            )
          );

        if (existingGuardians.length >= 5) {
          throw new AppError(400, 'GUARDIAN_LIMIT_EXCEEDED', 'A user cannot have more than 5 guardians');
        }

        // 5. Concurrency-safe duplicate phone check for the same user
        const duplicatePhone = existingGuardians.find((g) => g.phoneE164 === normalizedPhone);
        if (duplicatePhone) {
          throw new AppError(400, 'DUPLICATE_GUARDIAN_PHONE', 'A guardian with this phone number already exists');
        }

        // 6. Insert new guardian with consentStatus = 'pending' (NEVER 'granted')
        const newGuardianId = crypto.randomUUID();
        const createdAt = Date.now();

        const [inserted] = await tx
          .insert(guardians)
          .values({
            id: newGuardianId,
            userId,
            name: data.name.trim(),
            phoneE164: normalizedPhone,
            email: data.email ? data.email.trim() : null,
            relationship: data.relationship.trim(),
            channels: data.channels,
            consentStatus: 'pending', // Inviolable requirement: starts as pending
            createdAt,
          })
          .returning();

        // 7. Generate Telegram deep link if telegram channel requested
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'safarsaathi_bot';
        const telegramDeepLink = data.channels.includes('telegram')
          ? `https://t.me/${botUsername}?start=g_${newGuardianId}`
          : null;

        // 8. Dispatch invitation notification (non-blocking, privacy-safe)
        if (data.channels.includes('sms') && newGuardianId !== SYSTEM_TOMBSTONE_GUARDIAN_ID) {
          try {
            const inviteText =
              `SafarSaathi: ${userRow.name || 'A contact'} has added you as a trusted safety guardian. / ` +
              `सफ़रसाथी: आपको एक सुरक्षा अभिभावक के रूप में जोड़ा गया है।`;
            await this.smsProvider.sendSms({
              toPhoneE164: normalizedPhone,
              messageText: inviteText,
            });
          } catch (err: unknown) {
            logger.warn({ guardianId: newGuardianId }, 'Could not dispatch guardian invitation SMS');
          }
        }

        logger.info({ userId, guardianId: newGuardianId }, 'Guardian added successfully (pending consent)');

        return {
          guardian: {
            id: inserted.id,
            name: inserted.name,
            phoneE164: inserted.phoneE164,
            email: inserted.email ?? null,
            relationship: inserted.relationship,
            channels: inserted.channels as ('sms' | 'telegram' | 'email')[],
            consentStatus: 'pending',
            createdAt: inserted.createdAt,
          },
          telegramDeepLink,
        };
      });
    });
  }

  /**
   * FR-02, FR-14: DELETE /guardians/:id - Remove guardian and revoke active share links.
   * Preserves historical SOS events, deliveries, and acknowledgements under system tombstone.
   */
  async removeGuardian(userId: string, guardianId: string): Promise<OkResponse> {
    if (userId.toLowerCase().startsWith('system_')) {
      throw new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot remove guardians');
    }

    if (guardianId === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
      throw new AppError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found');
    }

    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // 1. Transaction-scoped user advisory lock
        await tx.execute(userAdvisoryLockSql(userId));

        // 2. Query guardian
        const [existing] = await tx
          .select()
          .from(guardians)
          .where(eq(guardians.id, guardianId));

        // 3. Strict ownership validation: prevent IDOR and cross-user deletion
        if (!existing || existing.userId !== userId) {
          throw new AppError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found');
        }

        // 4. Revoke/delete all active share links associated with this guardian
        await tx
          .delete(shareLinks)
          .where(eq(shareLinks.guardianId, guardianId));

        // 5. Ensure system tombstone records exist for forensic preservation
        await tx
          .insert(users)
          .values({
            id: SYSTEM_TOMBSTONE_USER_ID,
            name: '[DELETED USER]',
            phone: '+000000000000',
            lang: 'en',
            boxPub: 'tombstone_box_pub',
            signPub: 'tombstone_sign_pub',
            createdAt: 0,
          })
          .onConflictDoNothing();

        await tx
          .insert(guardians)
          .values({
            id: SYSTEM_TOMBSTONE_GUARDIAN_ID,
            userId: SYSTEM_TOMBSTONE_USER_ID,
            name: '[DELETED GUARDIAN]',
            phoneE164: '+000000000000',
            relationship: 'system',
            channels: ['sms'],
            consentStatus: 'revoked',
            createdAt: 0,
          })
          .onConflictDoNothing();

        // 6. Reassign historical SOS deliveries and acknowledgements to tombstone guardian
        await tx
          .update(sosDeliveries)
          .set({ guardianId: SYSTEM_TOMBSTONE_GUARDIAN_ID })
          .where(eq(sosDeliveries.guardianId, guardianId));

        await tx
          .update(sosAcks)
          .set({ guardianId: SYSTEM_TOMBSTONE_GUARDIAN_ID })
          .where(eq(sosAcks.guardianId, guardianId));

        // 7. Delete the guardian row
        await tx
          .delete(guardians)
          .where(and(eq(guardians.id, guardianId), eq(guardians.userId, userId)));

        logger.info({ userId, guardianId }, 'Guardian removed and associated share links revoked');

        return { ok: true };
      });
    });
  }

  /**
   * Verifies whether a guardian has granted consent for live location tracking.
   * Throws AppError(403, 'CONSENT_REQUIRED', ...) if pending or revoked.
   */
  async assertLiveLocationAccess(guardianId: string): Promise<boolean> {
    if (guardianId === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
      throw new AppError(403, 'FORBIDDEN', 'System tombstone guardian cannot access live location');
    }

    const [guardian] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId));

    if (!guardian) {
      throw new AppError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found');
    }

    if (guardian.consentStatus !== 'granted') {
      throw new AppError(
        403,
        'CONSENT_REQUIRED',
        `Guardian does not have granted consent for live tracking (current status: ${guardian.consentStatus})`
      );
    }

    return true;
  }
}

export const guardiansService = new GuardiansService();
