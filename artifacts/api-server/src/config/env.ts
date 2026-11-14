import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  ALLOWED_ORIGINS: z.string().default('*'),

  // Database
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/safarsaathi'),

  // Firebase
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Development auth bypass (must NEVER be set in production)
  DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),

  // Relay Box Keys
  SERVER_BOX_SECRET_KEY: z.string().default(''),
  SERVER_BOX_PUBLIC_KEY: z.string().default(''),
  // Relay packet destination tag: exactly 8 bytes, hexadecimal encoded.
  // It is provisioned to clients in the RelayBundle and is never a secret.
  RELAY_DEST_TAG: z.string().default(''),
  RELAY_MAX_AGE_SEC: z.coerce.number().int().min(1).max(86_400).default(86_400),
  RELAY_FUTURE_SKEW_SEC: z.coerce.number().int().min(0).max(3_600).default(300),

  // SMS
  SMS_PROVIDER: z.enum(['console', 'android-gateway']).default('console'),
  SMS_GATEWAY_URL: z.string().optional(),
  SMS_GATEWAY_USER: z.string().optional(),
  SMS_GATEWAY_PASSWORD: z.string().optional(),
  SMS_GATEWAY_PASSPHRASE: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Email
  SMTP_URL: z.string().optional(),

  // Routing
  ORS_API_KEY: z.string().optional(),
  ROUTING_DAILY_LIMIT: z.coerce.number().default(1800),

  // Tick & Watchdog
  TICK_SECRET: z.string().default('safarsaathi_dev_tick_secret_replace_in_prod'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  GUARDIAN_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  GUARDIAN_MAP_STYLE_URL: z.string().default('https://tiles.openfreemap.org/styles/liberty'),
  WATCHDOG_SIGNAL_LOST_SEC: z.coerce.number().default(180),
  WATCHDOG_LOST_CONTACT_SEC: z.coerce.number().default(300),
  WATCHDOG_ETA_GRACE_SEC: z.coerce.number().default(600),
  RETENTION_TRIP_POINTS_DAYS: z.coerce.number().default(7),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }
    if (!data.TICK_SECRET || data.TICK_SECRET === 'safarsaathi_dev_tick_secret_replace_in_prod') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TICK_SECRET'],
        message: 'A secure TICK_SECRET must be configured in production',
      });
    }
    if (!data.FIREBASE_SERVICE_ACCOUNT_JSON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON is required in production',
      });
    }
    if (data.DEV_AUTH_BYPASS === 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_AUTH_BYPASS'],
        message: 'DEV_AUTH_BYPASS must not be enabled in production',
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;

