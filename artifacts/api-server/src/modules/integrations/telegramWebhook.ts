import { Router } from 'express';
import { notImplemented } from '../../lib/errors.js';

export const telegramWebhookRouter = Router();

/**
 * POST /integrations/telegram/webhook
 * FR-02, FR-08: Receive Telegram bot updates (consent commands /start <token> and 'I am on it' callbacks)
 * Outside /api/v1; verified by Telegram secret token header (X-Telegram-Bot-Api-Secret-Token).
 */
telegramWebhookRouter.post('/telegram/webhook', (req, _res, next) => {
  // TODO: Verify X-Telegram-Bot-Api-Secret-Token against TELEGRAM_WEBHOOK_SECRET
  // TODO: Process message / callback_query for guardian consent or SOS acknowledgment
  next(notImplemented('POST /integrations/telegram/webhook - Telegram webhook'));
});

