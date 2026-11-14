import { db, shareLinks, trips, guardians, users, tripPoints, sosEvents, rides, SYSTEM_TOMBSTONE_GUARDIAN_ID } from '@workspace/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sha256 } from '../../lib/crypto.js';
import { nowEpochMs } from '../../lib/time.js';

/**
 * Public tracking details response type
 */
export interface PublicTrackingDetails {
  userName: string;
  tripStatus: string;
  lastLat?: number;
  lastLng?: number;
  lastSeenAt?: number;
  accuracyM?: number;
  targetId?: string;
  isExpired: boolean;
  ridePlate?: string;
  rideDriver?: string;
}

/**
 * Service for Public Tracking by token (FR-04, FR-07)
 */
export class PublicService {
  /**
   * Look up trip/SOS by token hash and verify expiration
   */
  async getTrackingByToken(rawToken: string): Promise<PublicTrackingDetails> {
    // Hash the raw token with SHA-256
    const tokenHash = sha256(rawToken);

    // Find the share link by token hash
    const [shareLink] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.tokenHash, tokenHash))
      .limit(1);

    if (!shareLink) {
      throw new AppError(404, 'INVALID_TOKEN', 'Invalid or expired tracking link');
    }

    // Check revocation
    if (shareLink.revokedAt) {
      throw new AppError(410, 'LINK_REVOKED', 'This tracking link has been revoked');
    }

    if (shareLink.guardianId) {
      const [guardian] = await db
        .select({ id: guardians.id, consentStatus: guardians.consentStatus })
        .from(guardians)
        .where(eq(guardians.id, shareLink.guardianId))
        .limit(1);
      if (!guardian || guardian.consentStatus === 'revoked' || guardian.id === SYSTEM_TOMBSTONE_GUARDIAN_ID) {
        throw new AppError(403, 'FORBIDDEN', 'Guardian access is no longer permitted');
      }
    }

    // Check expiration
    if (shareLink.expiresAt && shareLink.expiresAt < nowEpochMs()) {
      throw new AppError(410, 'LINK_EXPIRED', 'This tracking link has expired');
    }

    // Check if share link is for a trip
    if (shareLink.tripId) {
      const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, shareLink.tripId))
        .limit(1);

      if (!trip) {
        throw new AppError(404, 'TRIP_NOT_FOUND', 'Associated trip not found');
      }

      // Check if trip is still active
      if (trip.status !== 'active') {
        return {
          userName: '',
          tripStatus: trip.status,
          isExpired: true,
        };
      }

      // Get the latest location point
      const [latestPoint] = await db
        .select({ lat: tripPoints.lat, lng: tripPoints.lng, ts: tripPoints.ts, acc: tripPoints.acc })
        .from(tripPoints)
        .where(eq(tripPoints.tripId, shareLink.tripId))
        .orderBy(desc(tripPoints.ts))
        .limit(1);

      // Get user name
      const [tripUser] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, trip.userId))
        .limit(1);

      // Get ride details if registered
      const [ride] = await db
        .select({ plate: rides.plate, driverName: rides.driverName })
        .from(rides)
        .where(eq(rides.tripId, shareLink.tripId))
        .orderBy(desc(rides.startedAt))
        .limit(1);

      return {
        userName: tripUser?.name ?? 'A contact',
        tripStatus: trip.status,
        lastLat: latestPoint?.lat ?? trip.lastLat ?? undefined,
        lastLng: latestPoint?.lng ?? trip.lastLng ?? undefined,
        lastSeenAt: latestPoint?.ts ?? trip.lastSeenAt,
        accuracyM: latestPoint?.acc ?? undefined,
        targetId: shareLink.tripId,
        isExpired: false,
        ridePlate: ride?.plate ?? undefined,
        rideDriver: ride?.driverName ?? undefined,
      };
    }

    // Check if share link is for an SOS event
    if (shareLink.sosId) {
      const [sos] = await db.select().from(sosEvents).where(eq(sosEvents.id, shareLink.sosId)).limit(1);
      if (!sos || sos.userId === 'system_tombstone_user') {
        throw new AppError(404, 'NOT_FOUND', 'Associated SOS not found');
      }
      const [sosUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, sos.userId)).limit(1);
      const terminal = sos.status === 'cancelled' || sos.status === 'resolved';
      return {
        userName: sosUser?.name ?? 'A contact',
        tripStatus: `sos_${sos.status}`,
        lastLat: sos.lastLat ?? undefined,
        lastLng: sos.lastLng ?? undefined,
        lastSeenAt: sos.lastLocationAt ?? sos.receivedAt,
        accuracyM: sos.locationAccuracyM ?? undefined,
        targetId: shareLink.sosId,
        isExpired: terminal,
      };
    }

    throw new AppError(404, 'NOT_FOUND', 'Invalid tracking link');
  }
}

export const publicService = new PublicService();
