import { pgTable, uuid, text, bigint, index } from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    ts: bigint('ts', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('audit_log_ts_idx').on(table.ts),
    index('audit_log_actor_idx').on(table.actor),
  ]
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

