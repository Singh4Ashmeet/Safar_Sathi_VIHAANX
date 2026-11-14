import { pgTable, uuid, varchar, text, boolean, bigint, integer, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { trips } from './trips.js';
import { guardians } from './guardians.js';

export const sosEvents = pgTable(
  'sos_events',
  {
    id: uuid('id').primaryKey(), // Client-generated UUIDv4
    userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    trigger: varchar('trigger', { length: 32 }).notNull(), // 'button' | 'shake' | 'prompt_timeout' | 'watchdog' | 'ble_relay'
    duress: boolean('duress').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'acknowledged' | 'resolved' | 'cancelled'
    source: varchar('source', { length: 32 }).notNull().default('direct'), // 'direct' | 'ble_gateway'
    gatewayDeviceHash: text('gateway_device_hash'),
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    locationAccuracyM: doublePrecision('location_accuracy_m'),
    battery: integer('battery'),
    lastLocationAt: bigint('last_location_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('sos_events_user_id_idx').on(table.userId),
    index('sos_events_status_idx').on(table.status),
    check('sos_events_status_check', sql`${table.status} IN ('active', 'acknowledged', 'resolved', 'cancelled')`),
    check('sos_events_source_check', sql`${table.source} IN ('direct', 'ble_gateway')`),
  ]
);

export const sosDeliveries = pgTable(
  'sos_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sosId: uuid('sos_id').notNull().references(() => sosEvents.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 32 }).notNull(), // 'push' | 'sms' | 'telegram' | 'email'
    status: varchar('status', { length: 32 }).notNull().default('queued'), // 'queued' | 'sent' | 'failed' | 'acknowledged'
    providerRef: text('provider_ref'),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('sos_deliveries_sos_id_idx').on(table.sosId),
    index('sos_deliveries_guardian_id_idx').on(table.guardianId),
    check('sos_deliveries_channel_check', sql`${table.channel} IN ('push', 'sms', 'telegram', 'email')`),
    check('sos_deliveries_status_check', sql`${table.status} IN ('queued', 'sent', 'failed', 'acknowledged')`),
  ]
);

export const sosAcks = pgTable(
  'sos_acks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sosId: uuid('sos_id').notNull().references(() => sosEvents.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),
    ackAt: bigint('ack_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('sos_acks_sos_id_idx').on(table.sosId),
  ]
);

export type SosEvent = typeof sosEvents.$inferSelect;
export type NewSosEvent = typeof sosEvents.$inferInsert;
export type SosDelivery = typeof sosDeliveries.$inferSelect;
export type NewSosDelivery = typeof sosDeliveries.$inferInsert;
export type SosAck = typeof sosAcks.$inferSelect;
export type NewSosAck = typeof sosAcks.$inferInsert;

