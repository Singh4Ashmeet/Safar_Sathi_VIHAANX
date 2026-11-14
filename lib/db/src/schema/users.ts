import { pgTable, varchar, text, bigint } from 'drizzle-orm/pg-core';

export const SYSTEM_TOMBSTONE_USER_ID = 'system_tombstone_user';

export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(), // Firebase uid
  name: text('name').notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  lang: varchar('lang', { length: 10 }).notNull().default('en'),
  boxPub: text('box_pub').notNull(),
  signPub: text('sign_pub').notNull(),
  expoPushToken: text('expo_push_token'),
  adultConfirmedAt: bigint('adult_confirmed_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

