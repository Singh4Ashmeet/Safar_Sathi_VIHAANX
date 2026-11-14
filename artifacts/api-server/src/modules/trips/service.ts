import {
  db,
  users,
  trips,
  tripPoints,
  guardians,
  shareLinks,
  sosEvents,
  sosDeliveries,
  sosAcks,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
  SYSTEM_TOMBSTONE_USER_ID,
} from '@workspace/db';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { userAdvisoryLockSql, withTransactionRetry } from '../../lib/lock.js';
import { nowEpochMs, addSeconds } from '../../lib/time.js';
import type { CreateTripInput } from './validation.js';
import type { Trip } from '@workspace/api-zod';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { watchdogWorker } from '../../workers/watchdog.js';
import { trackingBroadcaster } from '../public/liveTracking.js';

/**
 * Service for Safe Trip, Location Ingest, and Share Links (FR-03, FR-04)
 */
export class TripsService {
  /**
   * FR-03: POST /trips - Create trip (client UUID) with destination, route polyline, ETA
   */
  async createTrip(userId: string, data: CreateTripInput): Promise<Trip> {
    // Validate optional tripId ownership - if client provides tripId, check for conflicts
    if (data.tripId) {
      const [existingTrip] = await db
        .select({ id: trips.id, userId: trips.userId })
        .from(trips)
        .where(eq(trips.id, data.tripId))
        .limit(1);

      if (existingTrip) {
        if (existingTrip.userId !== userId) {
          throw new AppError(409, 'TRIP_ID_CONFLICT', 'Trip ID already exists for a different user');
        }
        // Same user, same tripId - idempotent, return existing trip
        const [fullTrip] = await db
          .select()
          .from(trips)
          .where(eq(trips.id, existingTrip.id))
          .limit(1);
        if (!fullTrip) {
          throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found after creation');
        }
        return this.getTripResponse(fullTrip);
      }
    }

    // Validate user exists
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found. Please complete profile setup.');
    }

    const tripId = data.tripId || crypto.randomUUID();

    // Calculate nextCheckAt for watchdog scheduling (WATCHDOG_SIGNAL_LOST_SEC = 180 seconds default)
    const nextCheckAt = addSeconds(data.startedAt, Number(process.env.WATCHDOG_SIGNAL_LOST_SEC) || 180);

    const newTrip = await withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user
        await tx.execute(userAdvisoryLockSql(userId));

        // Check if trip already exists (idempotency check under lock)
        const [existingTrip] = await tx
          .select({ id: trips.id, userId: trips.userId })
          .from(trips)
          .where(eq(trips.id, data.tripId || crypto.randomUUID()))
          .limit(1);

        if (existingTrip) {
          if (existingTrip.userId !== userId) {
            throw new AppError(409, 'TRIP_ID_CONFLICT', 'Trip ID already exists for a different user');
          }
          // Get full trip for response
          const [fullTrip] = await tx
            .select()
            .from(trips)
            .where(eq(trips.id, existingTrip.id))
            .limit(1);
          if (!fullTrip) {
            throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found after creation');
          }
          return this.getTripResponse(fullTrip);
        }

        // Create new trip
        const [inserted] = await tx
          .insert(trips)
          .values({
            id: data.tripId || crypto.randomUUID(),
            userId,
            destination: data.destination,
            destLat: data.destLat,
            destLng: data.destLng,
            routePolyline: data.routePolyline,
            status: 'active',
            startedAt: data.startedAt,
            etaAt: data.etaAt ?? null,
            endedAt: null,
            lastSeenAt: data.startedAt, // Initially same as startedAt
            lastLat: null,
            lastLng: null,
            nextCheckAt: addSeconds(data.startedAt, Number(process.env.WATCHDOG_SIGNAL_LOST_SEC) || 180),
            escalationStage: null,
          })
          .returning();

        return this.getTripResponse(inserted);
      });
    });

    return newTrip;
  }

  /**
   * FR-03: POST /trips/:id/locations - Batch location ingest (idempotent by ts)
   */
  async ingestLocations(userId: string, tripId: string, points: { lat: number; lng: number; acc?: number; ts: number; mocked?: boolean }[]): Promise<{ accepted: number; lastSeenAt: number }> {
    // Validate trip ownership and get trip
    const [trip] = await db
      .select({
        id: trips.id,
        userId: trips.userId,
        status: trips.status,
        lastSeenAt: trips.lastSeenAt,
        startedAt: trips.startedAt,
      })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .limit(1);

    if (!trip) {
      throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found');
    }

    // Check if trip is in a state that can receive location updates
    if (trip.status !== 'active') {
      throw new AppError(409, 'INVALID_TRIP_STATE', `Cannot ingest locations for trip in ${trip.status} state`);
    }

    // Validate and filter points
    const now = nowEpochMs();
    const validPoints = points
      .filter(p => {
        // Validate coordinates
        if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
          return false;
        }
        // Validate timestamp is reasonable (not too far in future)
        if (p.ts > now + 61000) { // Allow 1 minute + 1s buffer for clock skew
          return false;
        }
        // Reject negative timestamps
        if (p.ts < 0) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.ts - b.ts); // Sort by timestamp ascending

    if (validPoints.length === 0) {
      throw new AppError(400, 'INVALID_POINTS', 'No valid location points in batch');
    }

    // Process points with idempotency (ON CONFLICT DO NOTHING on trip_id, ts)
    const accepted = await withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Lock the trip row to prevent concurrent updates
        await tx.execute(userAdvisoryLockSql(tripId));

        // Verify trip still exists and is active
        const [trip] = await tx
          .select({ id: trips.id, status: trips.status, lastSeenAt: trips.lastSeenAt, startedAt: trips.startedAt })
          .from(trips)
          .where(eq(trips.id, tripId))
          .for('update')
          .limit(1);

        if (!trip || trip.status !== 'active') {
          throw new AppError(409, 'INVALID_TRIP_STATE', `Cannot ingest locations for trip in ${trip?.status ?? 'unknown'} state`);
        }

        let acceptedCount = 0;
        let latestSeenAt = trip.lastSeenAt;
        let latestLat: number | null = null;
        let latestLng: number | null = null;

        for (const point of validPoints) {
          // Skip points older than the current lastSeenAt (out of order)
          if (point.ts <= (latestSeenAt ?? 0)) {
            continue;
          }

          // Try to insert the point (idempotent on trip_id + ts)
          try {
            await tx.insert(tripPoints).values({
              tripId,
              ts: point.ts,
              lat: point.lat,
              lng: point.lng,
              acc: point.acc ?? null,
            }).onConflictDoNothing();

            acceptedCount++;
            // Update latest location if this point is newer
            if (point.ts > (latestSeenAt ?? 0)) {
              latestSeenAt = point.ts;
              latestLat = point.lat;
              latestLng = point.lng;
            }
          } catch (err) {
            // If conflict on unique constraint, point already exists - skip
            const code = err instanceof Error ? (err as any).code : undefined;
            if (code !== '23505') { // Not a unique violation
              throw err;
            }
            // Point already exists, check if it's newer than our current latest
            if (point.ts > (latestSeenAt ?? 0)) {
              // We need to fetch the existing point's coordinates
              const [existingPoint] = await tx
                .select({ lat: tripPoints.lat, lng: tripPoints.lng })
                .from(tripPoints)
                .where(and(eq(tripPoints.tripId, tripId), eq(tripPoints.ts, point.ts)))
                .limit(1);
              if (existingPoint) {
                latestLat = existingPoint.lat;
                latestLng = existingPoint.lng;
                latestSeenAt = point.ts;
              }
            }
          }
        }

        // Update trip's latest location and lastSeenAt
        const nextCheckAt = latestSeenAt ? addSeconds(latestSeenAt, Number(process.env.WATCHDOG_SIGNAL_LOST_SEC) || 180) : null;

        await tx
          .update(trips)
          .set({
            lastSeenAt: latestSeenAt ?? trip.lastSeenAt,
            lastLat: latestLat,
            lastLng: latestLng,
            nextCheckAt: nextCheckAt,
          })
          .where(eq(trips.id, tripId));

        return { accepted: acceptedCount, lastSeenAt: latestSeenAt ?? trip.lastSeenAt ?? trip.startedAt };
      });
    });

    logger.info({ userId, tripId, accepted: accepted.accepted }, 'Location batch ingested');

    const latestPoint = validPoints[validPoints.length - 1];
    if (latestPoint) {
      trackingBroadcaster.broadcast(tripId, {
        lastLat: latestPoint.lat,
        lastLng: latestPoint.lng,
        lastSeenAt: latestPoint.ts,
        tripStatus: 'active',
        accuracyM: latestPoint.acc,
      });
    }

    return { accepted: accepted.accepted, lastSeenAt: accepted.lastSeenAt };
  }

  /**
   * FR-04: POST /trips/:id/share - Create expiring guardian share link
   * - Validates trip ownership and guardian consent
   * - Generates secure random token, stores SHA-256 hash
   * - Returns full URL with raw token (only time it's exposed)
   */
  async createShareLink(userId: string, tripId: string, data: { guardianId: string; expiresInSec?: number }): Promise<{ url: string; expiresAt: number }> {
    const expiresInSec = data.expiresInSec ?? 86400; // Default 24 hours
    const now = nowEpochMs();
    const expiresAt = now + expiresInSec * 1000;

    // Validate trip ownership and status
    const [trip] = await db
      .select({ id: trips.id, userId: trips.userId, status: trips.status })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .limit(1);

    if (!trip) {
      throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found');
    }

    if (trip.status !== 'active') {
      throw new AppError(409, 'INVALID_TRIP_STATE', 'Cannot create share link for non-active trip');
    }

    // Validate guardian exists, belongs to user, and has granted consent
    const [guardian] = await db
      .select()
      .from(guardians)
      .where(and(
        eq(guardians.id, data.guardianId),
        eq(guardians.userId, userId),
        eq(guardians.consentStatus, 'granted')
      ))
      .limit(1);

    if (!guardian) {
      throw new AppError(404, 'GUARDIAN_NOT_FOUND', 'Guardian not found or consent not granted');
    }

    // Check if guardian is tombstone
    if (guardian.id === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
      throw new AppError(400, 'INVALID_GUARDIAN', 'Cannot create share link for tombstone guardian');
    }

    // Check if guardian is revoked
    if (guardian.consentStatus === 'revoked') {
      throw new AppError(403, 'GUARDIAN_REVOKED', 'Guardian consent has been revoked');
    }

    // Generate cryptographically secure random token (32 bytes = 256 bits)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Use advisory lock to prevent concurrent duplicate creation
    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user
        await tx.execute(userAdvisoryLockSql(userId));

        // Check for existing active share link for this trip + guardian (idempotency)
        const [existingLink] = await tx
          .select()
          .from(shareLinks)
          .where(and(
            eq(shareLinks.tripId, tripId),
            eq(shareLinks.guardianId, data.guardianId),
            sql`${shareLinks.revokedAt} IS NULL`,
            sql`${shareLinks.expiresAt} > ${nowEpochMs()}`
          ))
          .limit(1);

        if (existingLink) {
          // Return existing link (idempotent) - generate new token for response since we can't recover original
          const newToken = crypto.randomBytes(32).toString('hex');
          const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
          return {
            url: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/t/${newToken}`,
            expiresAt: existingLink.expiresAt,
          };
        }

        // Generate cryptographically secure random token (32 bytes = 256 bits)
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const now = nowEpochMs();
        const expiresAt = now + expiresInSec * 1000;

        // Store only the hash in the database
        await tx.insert(shareLinks).values({
          id: crypto.randomUUID(),
          tokenHash,
          tripId,
          guardianId: data.guardianId,
          expiresAt,
          createdAt: now,
        });

        // Return the full URL with the raw token (only time it's ever exposed)
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
        return {
          url: `${baseUrl}/t/${token}`,
          expiresAt,
        };
      });
    });
  }

  /**
   * FR-04, FR-14: DELETE /trips/:id/share - Revoke share link(s)
   * - Supports revoking all links for a trip or a specific guardian's link
   * - Sets revoked_at timestamp; does not delete records
   */
  async revokeShareLink(userId: string, tripId: string, guardianId?: string): Promise<{ ok: boolean }> {
    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user
        await tx.execute(userAdvisoryLockSql(userId));

        // Verify trip ownership
        const [trip] = await tx
          .select({ id: trips.id, userId: trips.userId })
          .from(trips)
          .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
          .limit(1);

        if (!trip) {
          throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found');
        }

        if (guardianId) {
          // Revoke specific guardian's link
          const [existingLink] = await tx
            .select()
            .from(shareLinks)
            .where(and(
              eq(shareLinks.tripId, tripId),
              eq(shareLinks.guardianId, guardianId),
              sql`${shareLinks.revokedAt} IS NULL`
            ))
            .limit(1);

          if (!existingLink) {
            throw new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Active share link not found for this guardian');
          }

          await tx
            .update(shareLinks)
            .set({ revokedAt: nowEpochMs() })
            .where(eq(shareLinks.id, existingLink.id));

          logger.info({ userId, tripId, guardianId }, 'Share link revoked for specific guardian');
        } else {
          // Revoke all active share links for this trip
          await tx
            .update(shareLinks)
            .set({ revokedAt: nowEpochMs() })
            .where(and(
              eq(shareLinks.tripId, tripId),
              sql`${shareLinks.revokedAt} IS NULL`
            ));

          logger.info({ userId, tripId }, 'All share links revoked for trip');
        }

        return { ok: true };
      });
    });
  }

  /**
   * Helper to convert trip DB row to API response format
   */
  private getTripResponse(trip: typeof trips.$inferSelect): Trip {
    return {
      id: trip.id,
      destination: trip.destination,
      destLat: trip.destLat,
      destLng: trip.destLng,
      routePolyline: trip.routePolyline,
      status: trip.status as 'active' | 'completed' | 'cancelled',
      startedAt: trip.startedAt,
      etaAt: trip.etaAt ?? undefined,
      endedAt: trip.endedAt ?? undefined,
      lastSeenAt: trip.lastSeenAt ?? undefined,
      escalationStage: trip.escalationStage ?? undefined,
    };
  }

  /**
   * FR-03: POST /trips/:id/end - End trip safely
   * - Validates trip ownership
   * - Only allows transition from 'active' to 'completed'
   * - Records endedAt timestamp
   * - Idempotent for repeated requests
   * - Does NOT revoke share links (they should show expired state per requirements)
   */
  async endTrip(userId: string, tripId: string): Promise<Trip> {
    const endedAt = nowEpochMs();

    return withTransactionRetry(async () => {
      return db.transaction(async (tx) => {
        // Acquire advisory lock for this user to prevent concurrent end/location races
        await tx.execute(userAdvisoryLockSql(userId));

        // Get trip with FOR UPDATE to lock the row
        const [trip] = await tx
          .select()
          .from(trips)
          .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
          .for('update')
          .limit(1);

        if (!trip) {
          throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found');
        }

        // Check current status - idempotent if already completed
        if (trip.status === 'completed') {
          logger.info({ userId, tripId }, 'Trip already completed, returning existing state');
          return this.getTripResponse(trip);
        }

        if (trip.status !== 'active') {
          throw new AppError(409, 'INVALID_TRIP_STATE', `Cannot end trip in ${trip.status} state`);
        }

        // Update trip to completed status
        await tx
          .update(trips)
          .set({
            status: 'completed',
            endedAt,
            nextCheckAt: null, // Stop watchdog checks
          })
          .where(eq(trips.id, tripId));

        // NOTE: Per requirements, share links should NOT be revoked on trip completion.
        // They should remain accessible but return expired/completed state.
        // Revocation only happens via explicit DELETE /trips/:id/share or guardian removal.

        // Get updated trip for response
        const [updatedTrip] = await tx
          .select()
          .from(trips)
          .where(eq(trips.id, tripId))
          .limit(1);

        if (!updatedTrip) {
          throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found after completion');
        }

        logger.info({ userId, tripId, endedAt }, 'Trip completed successfully');
        return this.getTripResponse(updatedTrip);
      });
    });
  }
}

export const tripsService = new TripsService();