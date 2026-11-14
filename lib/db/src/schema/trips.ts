import { pgTable, uuid, varchar, text, doublePrecision, bigint, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey(), // Client-generated UUIDv4
    userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    destination: text('destination').notNull(),
    destLat: doublePrecision('dest_lat').notNull(),
    destLng: doublePrecision('dest_lng').notNull(),
    routePolyline: text('route_polyline').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'completed' | 'cancelled'
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    etaAt: bigint('eta_at', { mode: 'number' }),
    endedAt: bigint('ended_at', { mode: 'number' }),
    lastSeenAt: bigint('last_seen_at', { mode: 'number' }),
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    nextCheckAt: bigint('next_check_at', { mode: 'number' }),
    escalationStage: varchar('escalation_stage', { length: 32 }), // 'signal_lost' | 'user_prompted' | 'guardians_alerted'
  },
  (table) => [
    index('trips_next_check_at_idx').on(table.nextCheckAt),
    index('trips_user_id_idx').on(table.userId),
    check('trips_status_check', sql`${table.status} IN ('active', 'completed', 'cancelled')`),
    check('trips_escalation_stage_check', sql`${table.escalationStage} IS NULL OR ${table.escalationStage} IN ('signal_lost', 'user_prompted', 'guardians_alerted')`),
  ]
);

export const tripPoints = pgTable(
  'trip_points',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    ts: bigint('ts', { mode: 'number' }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    acc: doublePrecision('acc'),
  },
  (table) => [
    uniqueIndex('trip_points_trip_id_ts_idx').on(table.tripId, table.ts),
    index('trip_points_trip_id_idx').on(table.tripId),
  ]
);

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type TripPoint = typeof tripPoints.$inferSelect;
export type NewTripPoint = typeof tripPoints.$inferInsert;

