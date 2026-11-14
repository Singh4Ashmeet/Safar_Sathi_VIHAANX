import { pgTable, varchar, text, bigint, integer, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const relayPackets = pgTable(
  'relay_packets',
  {
    eventId: varchar('event_id', { length: 64 }).primaryKey(), // event_id primary key
    raw: text('raw').notNull(),
    destTag: varchar('dest_tag', { length: 32 }).notNull(),
    receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull(), // 'accepted' | 'duplicate' | 'invalid' | 'expired'
    processingStatus: varchar('processing_status', { length: 32 }).notNull().default('completed'), // 'pending' | 'processing' | 'completed' | 'exhausted'
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: bigint('next_attempt_at', { mode: 'number' }).notNull().default(0),
    leaseUntil: bigint('lease_until', { mode: 'number' }),
    lastError: text('last_error'),
    sosCreatedAt: bigint('sos_created_at', { mode: 'number' }),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('relay_packets_received_at_idx').on(table.receivedAt),
    index('relay_packets_dest_tag_idx').on(table.destTag),
    index('relay_packets_processing_idx').on(table.processingStatus, table.nextAttemptAt),
    check('relay_packets_status_check', sql`${table.status} IN ('accepted', 'duplicate', 'invalid', 'expired')`),
    check('relay_packets_processing_status_check', sql`${table.processingStatus} IN ('pending', 'processing', 'completed', 'exhausted')`),
    check('relay_packets_attempts_check', sql`${table.attempts} >= 0 AND ${table.attempts} <= 10`),
  ]
);

export type RelayPacket = typeof relayPackets.$inferSelect;
export type NewRelayPacket = typeof relayPackets.$inferInsert;

