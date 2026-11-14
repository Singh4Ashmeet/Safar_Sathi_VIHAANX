import { pool } from '@workspace/db';
import { logger } from '../lib/logger.js';

export interface DailyQuotaStatus {
  databaseSizeMb: number;
  orsDirectionsCountToday: number;
}

/**
 * Quota Check Worker (TRD 8.6)
 * Monitors Supabase 500 MB database size and OpenRouteService 2,000 daily directions quota.
 */
export class QuotaCheckWorker {
  async checkQuotas(): Promise<DailyQuotaStatus> {
    logger.info('[QuotaCheck] Checking free tier usage...');
    const client = await pool.connect();
    try {
      // 1. Check Supabase DB size
      const dbSizeRes = await client.query(`
        SELECT pg_database_size(current_database()) / (1024 * 1024) AS size_mb;
      `);
      const sizeMb = Number(dbSizeRes.rows[0]?.size_mb || 0);

      // 2. Check today's ORS count
      const today = new Date().toISOString().slice(0, 10);
      const orsRes = await client.query(
        `SELECT count FROM quota_usage WHERE service = 'ors_directions' AND day = $1`,
        [today]
      );
      const orsCount = Number(orsRes.rows[0]?.count || 0);

      logger.info({ sizeMb, orsCount }, '[QuotaCheck] Daily quota status recorded');
      return { databaseSizeMb: sizeMb, orsDirectionsCountToday: orsCount };
    } catch (err) {
      logger.error({ err }, '[QuotaCheck] Failed to inspect quotas');
      return { databaseSizeMb: 0, orsDirectionsCountToday: 0 };
    } finally {
      client.release();
    }
  }
}

export const quotaCheckWorker = new QuotaCheckWorker();

