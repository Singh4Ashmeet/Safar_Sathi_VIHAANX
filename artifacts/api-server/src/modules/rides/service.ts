import { db, rides, users, guardians, trips } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { nowEpochMs } from '../../lib/time.js';
import type { RegisterRideInput } from './validation.js';
import { notifyService } from '../notify/index.js';

/**
 * Service for Ride Verification (FR-11)
 */
export class RidesService {
  /**
   * FR-11: POST /rides - Register ride (plate, driver, expected route); shares with guardians
   */
  async registerRide(userId: string, data: RegisterRideInput): Promise<{ id: string; plate: string; driverName: string | null; tripId: string | null; startedAt: number; status: string }> {
    // Validate plate
    if (!data.plate || data.plate.length < 2 || data.plate.length > 32) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Plate must be 2-32 characters');
    }

    // Validate driver name if provided
    if (data.driverName && data.driverName.length > 120) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Driver name must be 120 characters or fewer');
    }

    let tripId: string | null = null;

    // If tripId provided, validate ownership and store the association
    if (data.tripId) {
      const [trip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, data.tripId), eq(trips.userId, userId)))
        .limit(1);

      if (!trip) {
        throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found or access denied');
      }
      tripId = trip.id;
    }

    // Get user name for notification
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userName = user?.name || 'A contact';

    const now = nowEpochMs();
    const [newRide] = await db
      .insert(rides)
      .values({
        userId,
        tripId,
        plate: data.plate.toUpperCase(),
        driverName: data.driverName ?? null,
        startedAt: now,
        status: 'active',
      })
      .returning();

    // Notify guardians of ride start
    await this.notifyGuardiansOfRide(userId, userName, newRide);

    logger.info({ userId, rideId: newRide.id, plate: newRide.plate, tripId }, 'Ride registered');

    return {
      id: newRide.id,
      plate: newRide.plate,
      driverName: newRide.driverName,
      tripId: newRide.tripId,
      startedAt: newRide.startedAt,
      status: newRide.status,
    };
  }

  /**
   * Notify guardians of ride start
   */
  private async notifyGuardiansOfRide(userId: string, userName: string, ride: { id: string; plate: string; driverName: string | null }): Promise<void> {
    const userGuardians = await db
      .select()
      .from(guardians)
      .where(and(
        eq(guardians.userId, userId),
        eq(guardians.consentStatus, 'granted')
      ));

    if (userGuardians.length === 0) {
      return;
    }

    const guardianContacts = userGuardians.map(g => ({
      guardianId: g.id,
      name: g.name,
      phoneE164: g.phoneE164,
      email: g.email,
      telegramChatId: g.telegramChatId,
      pushToken: undefined,
      channels: g.channels as ('sms' | 'telegram' | 'email' | 'push')[],
      consentStatus: 'granted' as const,
    }));

    const payload = {
      userName,
      rideId: ride.id,
      plate: ride.plate,
      driverName: ride.driverName,
    };

    await notifyService.dispatchFullAlert(ride.id, guardianContacts, payload as any);
  }
}

export const ridesService = new RidesService();

