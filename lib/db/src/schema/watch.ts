import { pgTable, uuid, varchar, bigint, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { trips } from './trips.js';

export const watchTimers = pgTable(
  'watch_timers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'confirmed' | 'expired'
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('watch_timers_user_id_idx').on(table.userId),
    index('watch_timers_ends_at_idx').on(table.endsAt),
    check('watch_timers_status_check', sql`${table.status} IN ('active', 'confirmed', 'expired')`),
  ]
);

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
    watchId: uuid('watch_id').references(() => watchTimers.id, { onDelete: 'cascade' }),
    stage: varchar('stage', { length: 32 }).notNull(), // 'signal_lost' | 'user_prompted' | 'guardians_alerted'
    firedAt: bigint('fired_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('escalations_trip_id_stage_idx').on(table.tripId, table.stage),
    uniqueIndex('escalations_watch_id_stage_idx').on(table.watchId, table.stage),
    check(
      'escalations_target_check',
      sql`(${table.tripId} IS NOT NULL AND ${table.watchId} IS NULL) OR (${table.tripId} IS NULL AND ${table.watchId} IS NOT NULL)`
    ),
    check(
      'escalations_stage_check',
      sql`${table.stage} IN ('signal_lost', 'user_prompted', 'guardians_alerted')`
    ),
  ]
);

export type WatchTimer = typeof watchTimers.$inferSelect;
export type NewWatchTimer = typeof watchTimers.$inferInsert;
export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;

