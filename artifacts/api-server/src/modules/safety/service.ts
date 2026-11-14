import { db, zones, reports, users } from '@workspace/db';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { nowEpochMs } from '../../lib/time.js';
import crypto from 'node:crypto';

/**
 * Service for Safety Zones and Crowd-sourced Reports (FR-10)
 */
export class SafetyService {
  /**
   * FR-10: GET /safety/zones - Return safety zones within radius and optional timeOfDay
   * Uses Haversine formula for distance calculation
   */
  async getZonesNearby(
    lat: number,
    lng: number,
    radiusM: number,
    timeOfDay?: string
  ): Promise<Array<{ id: string; lat: number; lng: number; radiusM: number; category: string; severity: 'low' | 'medium' | 'high'; source: 'seed' | 'reports'; updatedAt: number }>> {
    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid coordinates');
    }

    if (radiusM < 1 || radiusM > 50000) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Radius must be between 1 and 50000 meters');
    }

    // Validate timeOfDay if provided
    if (timeOfDay && !['day', 'night'].includes(timeOfDay)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'timeOfDay must be "day" or "night"');
    }

    // Use Haversine formula in SQL for distance calculation
    // Earth radius = 6371000 meters
    const distanceSql = sql`
      (6371000 * acos(
        cos(radians(${lat})) * cos(radians(${zones.lat})) * cos(radians(${zones.lng}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${zones.lat}))
      ))
    `;

    const conditions = [sql`${distanceSql} <= ${radiusM}`];

    if (timeOfDay) {
      // For timeOfDay filtering, we could add logic based on zone category/severity
      // For now, we return all zones within radius
    }

    const nearbyZones = await db
      .select({
        id: zones.id,
        lat: zones.lat,
        lng: zones.lng,
        radiusM: zones.radiusM,
        category: zones.category,
        severity: zones.severity,
        source: zones.source,
        updatedAt: zones.updatedAt,
      })
      .from(zones)
      .where(and(...conditions))
      .orderBy(distanceSql);

    // Cast to proper types
    const typedZones = nearbyZones.map(z => ({
      ...z,
      severity: z.severity as 'low' | 'medium' | 'high',
      source: z.source as 'seed' | 'reports',
    }));

    logger.debug({ lat, lng, radiusM, timeOfDay, count: typedZones.length }, 'Fetched nearby safety zones');
    return typedZones;
  }

  /**
   * FR-10: POST /safety/reports - Submit safety incident report with reporter rate limit
   * - Computes salted reporter_hash (anonymized)
   * - Enforces reporter rate limits (max 5 reports per hour per user)
   * - Inserts into reports table with status 'pending'
   */
  async submitReport(userId: string, data: { lat: number; lng: number; category: string; note?: string }): Promise<{ id: string; status: string; createdAt: number }> {
    // Validate coordinates
    if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid coordinates');
    }

    // Validate category
    const validCategories = ['poor_lighting', 'harassment', 'isolation', 'theft_snatch', 'safe_patrol'];
    if (!validCategories.includes(data.category)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid category');
    }

    // Validate note length
    if (data.note && data.note.length > 280) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Note must be 280 characters or fewer');
    }

    const now = nowEpochMs();
    const hourAgo = now - 60 * 60 * 1000;

    // Rate limiting: max 5 reports per hour per user
    const recentReports = await db
      .select({ count: sql<number>`count(*)` })
      .from(reports)
      .where(and(
        eq(reports.reporterHash, await this.computeReporterHash(userId)),
        sql`${reports.createdAt} > ${hourAgo}`
      ));

    if (Number(recentReports[0]?.count || 0) >= 5) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many reports submitted. Please wait before submitting more.');
    }

    // Compute salted reporter hash for anonymity
    const reporterHash = await this.computeReporterHash(userId);

    const [newReport] = await db
      .insert(reports)
      .values({
        lat: data.lat,
        lng: data.lng,
        category: data.category,
        note: data.note ?? null,
        reporterHash,
        status: 'pending',
        createdAt: now,
      })
      .returning();

    logger.info({ userId, reportId: newReport.id, category: data.category }, 'Safety report submitted');

    return {
      id: newReport.id,
      status: newReport.status,
      createdAt: newReport.createdAt,
    };
  }

  /**
   * Compute salted reporter hash for anonymized reporting
   */
  private async computeReporterHash(userId: string): Promise<string> {
    // Get user's phone for salting
    const [user] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const salt = user?.phone || 'unknown';
    const hash = crypto.createHash('sha256').update(`${userId}:${salt}`).digest('hex');
    return hash.substring(0, 64);
  }
}

export const safetyService = new SafetyService();

