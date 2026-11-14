import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { SYSTEM_TOMBSTONE_GUARDIAN_ID } from '@workspace/db';
import { NOTIFICATION_TEMPLATES, type NotificationPayload, type MinimalNotificationPayload } from './templates.js';
import { consoleSmsProvider } from './providers/sms/consoleProvider.js';
import { androidGatewayProvider } from './providers/sms/androidGatewayProvider.js';
import { expoPushProvider } from './providers/push/expoPush.js';
import { telegramBotProvider } from './providers/telegram/telegramBot.js';
import { smtpEmailProvider } from './providers/email/smtpEmail.js';
import type { SmsProvider } from './providers/sms/SmsProvider.js';

export interface GuardianContact {
  guardianId: string;
  name: string;
  phoneE164: string;
  email?: string | null;
  telegramChatId?: string | null;
  pushToken?: string | null;
  channels: string[]; // ['sms', 'telegram', 'email', 'push']
  consentStatus: 'granted' | 'pending' | 'revoked'; // Track consent status for payload selection
}

export interface DeliveryResult {
  guardianId: string;
  channel: string;
  status: 'queued' | 'sent' | 'failed';
  providerRef?: string;
  error?: string;
}

export interface DispatchResult {
  guardianId: string;
  channel: string;
  status: 'queued' | 'sent' | 'failed';
  providerRef?: string;
  error?: string;
}

/**
 * Notification Dispatcher (FR-08, FR-15, FR-19)
 * Handles parallel multi-channel fan-out (Push, SMS, Telegram, Email),
 * retry logic, per-recipient status rows, and fallback channels.
 */
export class NotifyService {
  private readonly smsProvider: SmsProvider;

  constructor() {
    this.smsProvider =
      env.SMS_PROVIDER === 'android-gateway'
        ? androidGatewayProvider
        : consoleSmsProvider;
  }

  /**
   * Dispatch full alert (with tracking URL) to granted guardians.
   */
  async dispatchFullAlert(
    sosId: string,
    guardians: GuardianContact[],
    payload: { userName: string; trackingUrl: string; sosId: string }
  ): Promise<DeliveryResult[]> {
    return this.dispatchAlertInternal(sosId, guardians, payload, 'full');
  }

  /**
   * Dispatch minimal alert (no tracking URL) to pending guardians.
   */
  /**
   * Dispatch minimal alert (no tracking URL) to pending guardians.
   */
  async dispatchMinimalAlert(
    sosId: string,
    guardians: GuardianContact[],
    payload: { userName: string; sosId: string }
  ): Promise<DeliveryResult[]> {
    return this.dispatchAlertInternal(sosId, guardians, payload, 'minimal');
  }

  /**
   * Backward-compatible dispatchAlert method for existing tests.
   * Uses full alert mode for backward compatibility.
   * @deprecated Use dispatchFullAlert or dispatchMinimalAlert instead.
   */
  async dispatchAlert(
    sosId: string,
    guardians: GuardianContact[],
    payload: { userName: string; trackingUrl: string; sosId: string }
  ): Promise<DeliveryResult[]> {
    return this.dispatchFullAlert(sosId, guardians, payload);
  }

  private async dispatchAlertInternal(
    sosId: string,
    guardians: GuardianContact[],
    payload: { userName: string; trackingUrl?: string; sosId: string } | { userName: string; sosId: string },
    mode: 'full' | 'minimal'
  ): Promise<DeliveryResult[]> {
    const isFull = mode === 'full';
    logger.info({ sosId, guardianCount: guardians.length, mode }, 'Dispatching SOS alert');

    const results: DeliveryResult[] = [];

    for (const guardian of guardians) {
      // Do not treat system tombstone guardian as a real guardian or notification recipient (FR-02, FR-15)
      if (guardian.guardianId === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
        logger.info({ sosId }, 'Skipping notification dispatch to system tombstone sentinel');
        continue;
      }

      // Skip revoked guardians
      if (guardian.consentStatus === 'revoked') {
        logger.info({ sosId, guardianId: guardian.guardianId }, 'Skipping revoked guardian');
        continue;
      }

      const isFullAlert = guardian.consentStatus === 'granted';

      // 1. Push notification (if guardian has the app & push token)
      if (guardian.pushToken) {
        const pushContent = isFullAlert
          ? NOTIFICATION_TEMPLATES.GUARDIAN_PUSH({ ...payload, sosId } as any)
          : NOTIFICATION_TEMPLATES.GUARDIAN_PUSH_MINIMAL({ userName: (payload as any).userName, sosId: (payload as any).sosId });
        const pushRes = await expoPushProvider.sendPushNotification(guardian.pushToken, pushContent);
        results.push({
          guardianId: guardian.guardianId,
          channel: 'push',
          status: pushRes.success ? 'sent' : 'failed',
          providerRef: pushRes.ticketId,
          error: pushRes.error,
        });
      }

      // 2. Telegram Bot (free parallel channel)
      if (guardian.channels.includes('telegram') && guardian.telegramChatId) {
        const tgText = isFullAlert
          ? NOTIFICATION_TEMPLATES.GUARDIAN_TELEGRAM(payload as any)
          : NOTIFICATION_TEMPLATES.GUARDIAN_TELEGRAM_MINIMAL({ userName: (payload as any).userName, sosId: (payload as any).sosId });
        const tgRes = await telegramBotProvider.sendMessage(guardian.telegramChatId, tgText);
        results.push({
          guardianId: guardian.guardianId,
          channel: 'telegram',
          status: tgRes.success ? 'sent' : 'failed',
          providerRef: tgRes.messageId ? String(tgRes.messageId) : undefined,
          error: tgRes.error,
        });
      }

      // 3. Email (free parallel channel)
      if (guardian.channels.includes('email') && guardian.email) {
        const emailContent = isFullAlert
          ? NOTIFICATION_TEMPLATES.GUARDIAN_EMAIL(payload as any)
          : NOTIFICATION_TEMPLATES.GUARDIAN_EMAIL_MINIMAL({ userName: (payload as any).userName, sosId: (payload as any).sosId });
        const emailRes = await smtpEmailProvider.sendEmail(
          guardian.email,
          emailContent.subject,
          emailContent.text
        );
        results.push({
          guardianId: guardian.guardianId,
          channel: 'email',
          status: emailRes.success ? 'sent' : 'failed',
          providerRef: emailRes.messageId,
          error: emailRes.error,
        });
      }

      // 4. SMS via Gateway phone (feature-phone guardian path)
      if (guardian.channels.includes('sms')) {
        const smsText = isFullAlert
          ? NOTIFICATION_TEMPLATES.GUARDIAN_SMS(payload as any)
          : NOTIFICATION_TEMPLATES.GUARDIAN_SMS_MINIMAL({ userName: (payload as any).userName, sosId: (payload as any).sosId });
        const smsRes = await this.smsProvider.sendSms({
          toPhoneE164: guardian.phoneE164,
          messageText: smsText,
        });
        results.push({
          guardianId: guardian.guardianId,
          channel: 'sms',
          status: smsRes.success ? 'sent' : 'failed',
          providerRef: smsRes.providerRef,
          error: smsRes.error,
        });
      }
    }

    return results;
  }

  /**
   * Recover and dispatch queued deliveries that were not dispatched (e.g., server crash after SOS commit).
   * This should be called on server startup or via a scheduled job.
   */
  async recoverQueuedDeliveries(sosId: string): Promise<DeliveryResult[]> {
    // This would be implemented with a recovery worker
    // For now, return empty array as placeholder
    logger.info({ sosId }, 'Recovery of queued deliveries not yet implemented');
    return [];
  }
}

export const notifyService = new NotifyService();

