import { env } from '../../../../config/env.js';
import { logger } from '../../../../lib/logger.js';

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Telegram Bot API provider (free parallel channel for guardians, TRD 8.2, FR-19).
 */
export class TelegramBotProvider {
  private readonly botToken = env.TELEGRAM_BOT_TOKEN;

  async sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured; skipping Telegram alert');
      return { success: false, error: 'Telegram unconfigured' };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = (await response.json()) as { ok: boolean; result?: { message_id: number } };
      return {
        success: data.ok,
        messageId: data.result?.message_id,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch Telegram message');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown Telegram error',
      };
    }
  }
}

export const telegramBotProvider = new TelegramBotProvider();

