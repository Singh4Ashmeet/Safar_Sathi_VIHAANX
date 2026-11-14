import { pgTable, uuid, varchar, text, bigint, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { trips } from './trips.js';

export const rides = pgTable(
  'rides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    plate: varchar('plate', { length: 64 }).notNull(),
    driverName: text('driver_name'),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'),
  },
  (table) => [
    index('rides_user_id_idx').on(table.userId),
    index('rides_trip_id_idx').on(table.tripId),
    check('rides_status_check', sql`${table.status} IN ('active', 'completed', 'cancelled')`),
  ]
);

export type Ride = typeof rides.$inferSelect;
export type NewRide = typeof rides.$inferInsert;

