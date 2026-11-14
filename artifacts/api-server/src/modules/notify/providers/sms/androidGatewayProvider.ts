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
      // TODO: Implement HTTP POST call to Android SMS Gateway endpoint
      // Using basic auth (SMS_GATEWAY_USER, SMS_GATEWAY_PASSWORD) and optional encryption passphrase
      logger.info({ provider: this.name }, '[SMS Gateway] Queuing SMS to Android Gateway');
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

