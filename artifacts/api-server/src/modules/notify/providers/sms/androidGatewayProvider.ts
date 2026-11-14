import type { SmsProvider, SendSmsOptions, SmsSendResult } from './SmsProvider.js';
import { env } from '../../../../config/env.js';
import { logger } from '../../../../lib/logger.js';

/**
 * SMS Gateway for Android provider (open source, Apache-2.0).
 * Connects to a spare phone acting as SMS gateway over Wi-Fi/cloud API.
 * (TRD 7.4, 8.2, 13.2 T18)
 */
export class AndroidGatewayProvider implements SmsProvider {
  readonly name = 'android-gateway';

  async sendSms(options: SendSmsOptions): Promise<SmsSendResult> {
    const gatewayUrl = env.SMS_GATEWAY_URL;
    if (!gatewayUrl) {
      logger.error('SMS Gateway URL not configured');
      return { success: false, error: 'SMS Gateway URL unconfigured' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (env.SMS_GATEWAY_USER || env.SMS_GATEWAY_PASSWORD) {
        const credentials = Buffer.from(
          `${env.SMS_GATEWAY_USER || ''}:${env.SMS_GATEWAY_PASSWORD || ''}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const res = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumbers: [options.toPhoneE164],
          message: options.messageText,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error({ status: res.status, text }, '[SMS Gateway] HTTP dispatch failed');
        return { success: false, error: `Gateway HTTP ${res.status}: ${text}` };
      }

      logger.info({ to: options.toPhoneE164 }, '[SMS Gateway] Successfully dispatched SMS via Android Gateway');
      return {
        success: true,
        providerRef: `gw-${Date.now()}`,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch via Android SMS Gateway');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown gateway error',
      };
    }
  }
}

export const androidGatewayProvider = new AndroidGatewayProvider();

