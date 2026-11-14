import { pgTable, uuid, varchar, bigint, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { trips } from './trips.js';
import { sosEvents } from './sos.js';
import { guardians } from './guardians.js';

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(), // Store only a hash of the token
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
    sosId: uuid('sos_id').references(() => sosEvents.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'cascade' }),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    revokedAt: bigint('revoked_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('share_links_trip_id_idx').on(table.tripId),
    index('share_links_sos_id_idx').on(table.sosId),
    index('share_links_token_hash_idx').on(table.tokenHash),
    check(
      'share_links_target_check',
      sql`(${table.tripId} IS NOT NULL AND ${table.sosId} IS NULL) OR (${table.tripId} IS NULL AND ${table.sosId} IS NOT NULL)`
    ),
  ]
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;

