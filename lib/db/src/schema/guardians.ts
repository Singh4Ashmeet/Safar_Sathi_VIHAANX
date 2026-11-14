import { pgTable, uuid, varchar, text, bigint, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const SYSTEM_TOMBSTONE_GUARDIAN_ID = '00000000-0000-0000-0000-000000000000';

export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phoneE164: varchar('phone_e164', { length: 32 }).notNull(),
    email: text('email'),
    relationship: varchar('relationship', { length: 64 }).notNull(),
    channels: text('channels').array().notNull(), // ['sms', 'telegram', 'email']
    telegramChatId: text('telegram_chat_id'),
    consentStatus: varchar('consent_status', { length: 32 }).notNull().default('pending'), // 'pending' | 'granted' | 'revoked'
    guardianUserId: varchar('guardian_user_id', { length: 128 }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('guardians_user_id_idx').on(table.userId),
    check('guardians_consent_status_check', sql`${table.consentStatus} IN ('pending', 'granted', 'revoked')`),
  ]
);

export type Guardian = typeof guardians.$inferSelect;
export type NewGuardian = typeof guardians.$inferInsert;

