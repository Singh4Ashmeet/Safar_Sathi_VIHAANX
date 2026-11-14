import { pgTable, uuid, varchar, text, doublePrecision, bigint, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const zones = pgTable(
  'zones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    radiusM: doublePrecision('radius_m').notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 32 }).notNull(), // 'low' | 'medium' | 'high'
    source: varchar('source', { length: 32 }).notNull(), // 'seed' | 'reports'
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('zones_coords_idx').on(table.lat, table.lng),
    check('zones_severity_check', sql`${table.severity} IN ('low', 'medium', 'high')`),
    check('zones_source_check', sql`${table.source} IN ('seed', 'reports')`),
  ]
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    note: text('note'),
    reporterHash: varchar('reporter_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('reports_reporter_hash_idx').on(table.reporterHash),
    index('reports_coords_idx').on(table.lat, table.lng),
    check('reports_status_check', sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  ]
);

export type Zone = typeof zones.$inferSelect;
export type NewZone = typeof zones.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

