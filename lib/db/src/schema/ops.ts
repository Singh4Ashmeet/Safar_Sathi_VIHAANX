import { pgTable, uuid, varchar, text, integer, doublePrecision, bigint, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tickLog = pgTable(
  'tick_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
    source: varchar('source', { length: 32 }).notNull(), // 'cron' | 'github' | 'in_process'
    tripsChecked: integer('trips_checked').notNull().default(0),
  },
  (table) => [
    index('tick_log_received_at_idx').on(table.receivedAt),
    check('tick_log_source_check', sql`${table.source} IN ('cron', 'github', 'in_process', 'boot_catch_up')`),
  ]
);

export const routeCache = pgTable(
  'route_cache',
  {
    key: text('key').primaryKey(), // origin cell, destination, hour bucket
    polyline: text('polyline').notNull(),
    durationSec: integer('duration_sec').notNull(),
    distanceM: doublePrecision('distance_m').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('route_cache_created_at_idx').on(table.createdAt),
  ]
);

export const quotaUsage = pgTable(
  'quota_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    service: varchar('service', { length: 64 }).notNull(),
    day: varchar('day', { length: 16 }).notNull(), // YYYY-MM-DD
    count: integer('count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('quota_usage_service_day_idx').on(table.service, table.day),
  ]
);

export type TickLog = typeof tickLog.$inferSelect;
export type NewTickLog = typeof tickLog.$inferInsert;
export type RouteCache = typeof routeCache.$inferSelect;
export type NewRouteCache = typeof routeCache.$inferInsert;
export type QuotaUsage = typeof quotaUsage.$inferSelect;
export type NewQuotaUsage = typeof quotaUsage.$inferInsert;

