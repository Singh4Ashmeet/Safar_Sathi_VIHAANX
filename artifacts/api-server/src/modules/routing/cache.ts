import { pool } from '@workspace/db';
import type { RouteResponse } from './orsClient.js';
import { logger } from '../../lib/logger.js';
import { nowEpochMs, addDays } from '../../lib/time.js';

/**
 * Route Caching logic (FR-16, Table route_cache)
 * Keyed by: origin cell, destination, hour bucket.
 * Prevents burning free OpenRouteService quota on repeated trips.
 */
export class RouteCacheService {
  /**
   * Generate cache key from coordinates (rounded to ~1km grid cells)
   */
  private generateKey(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): string {
    const originCell = `${Math.round(origin.lat * 100) / 100},${Math.round(origin.lng * 100) / 100}`;
    const destCell = `${Math.round(destination.lat * 100) / 100},${Math.round(destination.lng * 100) / 100}`;
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000)); // Hour bucket
    return `${originCell}|${destCell}|${hourBucket}`;
  }

  /**
   * Look up cached route.
   */
  async getCachedRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<RouteResponse | null> {
    const key = this.generateKey(origin, destination);
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT polyline, duration_sec, distance_m FROM route_cache WHERE key = $1 AND created_at > $2`,
        [key, nowEpochMs() - 3 * 24 * 60 * 60 * 1000] // 3-day retention
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        polyline: row.polyline,
        durationSec: row.duration_sec,
        distanceM: row.distance_m,
        source: 'cache',
      };
    } catch (err) {
      logger.error({ err }, 'Failed to get cached route');
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Save route in route_cache table.
   */
  async setCachedRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    route: RouteResponse
  ): Promise<void> {
    const key = this.generateKey(origin, destination);
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO route_cache (key, polyline, duration_sec, distance_m, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET
           polyline = EXCLUDED.polyline,
           duration_sec = EXCLUDED.duration_sec,
           distance_m = EXCLUDED.distance_m,
           created_at = EXCLUDED.created_at`,
        [key, route.polyline, route.durationSec, route.distanceM, nowEpochMs()]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to set cached route');
    } finally {
      client.release();
    }
  }
}

export const routeCacheService = new RouteCacheService();

