import { pool } from '@workspace/db';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { nowEpochMs, addDays } from '../lib/time.js';

/**
 * Retention Cleanup Worker (TRD section 10, Storage budget)
 * Protects Supabase 500 MB free quota by purging stale high-volume data:
 * - trip_points: default 7 days (RETENTION_TRIP_POINTS_DAYS)
 * - relay_packets: 7 days
 * - route_cache: 3 days
 * - tick_log: 14 days
 *
 * NOTES on data NOT purged:
 * - SOS records (sos_events, sos_deliveries, sos_acks): 12+ months retention.
 *   These are safety-critical legal records. Deletion is NOT performed by this worker.
 *   Account deletion preserves SOS records under tombstone (see account-deletion logic).
 * - Audit records (audit_log): 12+ months retention.
 *   Append-only by design (DB trigger prevents UPDATE/DELETE). Required for compliance.
 * - Safety zones/reports: Not auto-purged; managed separately.
 * - Rides: Not auto-purged; retained for safety/audit.
 *
 * If retention requirements change for SOS/audit data, a legal/compliance review
 * is required before implementing deletion.
 */
export class CleanupWorker {
  async runNightlyCleanup(): Promise<void> {
    logger.info('[Cleanup] Starting retention cleanup sweep...');
    const now = nowEpochMs();
    const tripPointsCutoff = addDays(now, -env.RETENTION_TRIP_POINTS_DAYS);
    const relayCutoff = addDays(now, -7);
    const routeCacheCutoff = addDays(now, -3);
    const tickLogCutoff = addDays(now, -14);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Purge old trip points
      const tripPointsResult = await client.query('DELETE FROM trip_points WHERE ts < $1', [tripPointsCutoff]);

      // Purge old relay raw packets
      // Never purge pending/processing relay work that may still be recovered.
      // Terminal packet records remain subject to the seven-day retention rule.
      const relayResult = await client.query(
        `DELETE FROM relay_packets
         WHERE received_at < $1
           AND processing_status IN ('completed', 'exhausted')`,
        [relayCutoff]
      );

      // Purge expired route caches
      const routeCacheResult = await client.query('DELETE FROM route_cache WHERE created_at < $1', [routeCacheCutoff]);

      // Purge old tick logs
      const tickLogResult = await client.query('DELETE FROM tick_log WHERE received_at < $1', [tickLogCutoff]);

      await client.query('COMMIT');
      logger.info(
        {
          tripPointsDeleted: tripPointsResult.rowCount,
          relayPacketsDeleted: relayResult.rowCount,
          routeCacheDeleted: routeCacheResult.rowCount,
          tickLogsDeleted: tickLogResult.rowCount,
        },
        '[Cleanup] Retention cleanup finished successfully'
      );
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, '[Cleanup] Retention cleanup failed');
    } finally {
      client.release();
    }
  }
}

export const cleanupWorker = new CleanupWorker();

