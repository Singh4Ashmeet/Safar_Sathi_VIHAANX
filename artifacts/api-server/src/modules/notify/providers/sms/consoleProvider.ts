import type { SmsProvider, SendSmsOptions, SmsSendResult } from './SmsProvider.js';
import { logger } from '../../../../lib/logger.js';

/**
 * Console SMS provider for local testing and CI.
 * Redacts recipient phone per privacy rules.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  async sendSms(options: SendSmsOptions): Promise<SmsSendResult> {
    logger.info({ provider: this.name, to: '[REDACTED_PHONE]' }, '[SMS Console] Outgoing simulated SMS');
    return {
      success: true,
      providerRef: `sim-${Date.now()}`,
    };
  }
}

export const consoleSmsProvider = new ConsoleSmsProvider();

