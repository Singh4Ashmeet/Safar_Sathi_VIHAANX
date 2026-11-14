import { pino } from 'pino';
import { env } from '../config/env.js';

// Sensitive fields to redact per security checklist (13.3 & TRD 8.6)
// Never log coordinates, phone numbers, or message bodies
const redactPaths = [
  'lat',
  'lng',
  'destLat',
  'destLng',
  'lastLat',
  'lastLng',
  'coordinates',
  'points[*].lat',
  'points[*].lng',
  'phone',
  'phoneE164',
  'phone_e164',
  'body',
  'message',
  'text',
  'note',
  'password',
  'token',
  'secret',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-tick-secret"]',
  'req.headers["x-dev-user-id"]',
  'req.headers["x-dev-user-email"]',
  'req.headers["x-telegram-bot-api-secret-token"]',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

