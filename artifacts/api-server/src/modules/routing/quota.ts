import { pool } from '@workspace/db';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { nowEpochMs } from '../../lib/time.js';

/**
 * Quota Guard for Free Tier OpenRouteService (FR-16)
 * Soft cap at 90% of daily quota (e.g. 1,800 of 2,000 calls).
 */
export class QuotaGuard {
  private readonly dailyCap = env.ROUTING_DAILY_LIMIT;

  /**
   * Check if routing quota is available today.
   */
  async isQuotaAvailable(): Promise<boolean> {
    const client = await pool.connect();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await client.query(
        `SELECT count FROM quota_usage WHERE service = 'ors_directions' AND day = $1`,
        [today]
      );
      const count = Number(res.rows[0]?.count || 0);
      const softCap = Math.floor(this.dailyCap * 0.9);
      return count < softCap;
    } catch (err) {
      logger.error({ err }, 'Failed to check routing quota');
      return true; // Allow on error (fail open)
    } finally {
      client.release();
    }
  }

  /**
   * Increment today's routing quota usage.
   */
  async incrementUsage(): Promise<void> {
    const client = await pool.connect();
    try {
      const today = new Date().toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO quota_usage (service, day, count) VALUES ('ors_directions', $1, 1)
         ON CONFLICT (service, day) DO UPDATE SET count = quota_usage.count + 1`,
        [today]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to increment routing quota');
    } finally {
      client.release();
    }
  }
}

export const quotaGuard = new QuotaGuard();

