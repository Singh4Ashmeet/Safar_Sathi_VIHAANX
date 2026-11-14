import { db, watchTimers } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { nowEpochMs, addMinutes } from '../../lib/time.js';
import type { StartWatchInput } from './validation.js';

/**
 * Service for Watch Me Server-Owned Timer (FR-09)
 */
export class WatchService {
  /**
   * FR-09: POST /watch - Start Watch Me (15, 30, 45, or 60 minutes)
   * - Validates minutes is one of allowed values
   * - Creates watch_timers record with ends_at = now() + minutes
   * - If timer expires without confirmation, watchdog escalates to guardians
   * - Prevents duplicate active timers for the same user
   */
  async startWatch(userId: string, minutes: StartWatchInput['minutes']): Promise<{ id: string; endsAt: number; status: string; createdAt: number }> {
    // Validate minutes is one of allowed values (15, 30, 45, 60)
    if (![15, 30, 45, 60].includes(minutes)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Minutes must be one of: 15, 30, 45, 60');
    }

    const now = nowEpochMs();
    const endsAt = addMinutes(now, minutes);

    // Check if user already has an active timer
    const [existingTimer] = await db
      .select()
      .from(watchTimers)
      .where(and(eq(watchTimers.userId, userId), eq(watchTimers.status, 'active')))
      .limit(1);

    if (existingTimer) {
      throw new AppError(409, 'TIMER_ACTIVE', 'User already has an active Watch Me timer');
    }

    const [newTimer] = await db
      .insert(watchTimers)
      .values({
        userId,
        endsAt,
        status: 'active',
        createdAt: now,
      })
      .returning();

    logger.info({ userId, watchId: newTimer.id, minutes, endsAt }, 'Watch Me timer started');

    return {
      id: newTimer.id,
      endsAt: newTimer.endsAt,
      status: newTimer.status,
      createdAt: newTimer.createdAt,
    };
  }

  /**
   * FR-09: POST /watch/:id/confirm - User confirms safe before timer expires
   * - Verifies watch belongs to user_id
   * - Marks watch_timers status 'confirmed'
   * - Returns updated timer
   */
  async confirmSafe(userId: string, watchId: string): Promise<{ id: string; endsAt: number; status: string; createdAt: number }> {
    const [timer] = await db
      .select()
      .from(watchTimers)
      .where(and(eq(watchTimers.id, watchId), eq(watchTimers.userId, userId)))
      .limit(1);

    if (!timer) {
      throw new AppError(404, 'WATCH_NOT_FOUND', 'Watch Me timer not found');
    }

    if (timer.status !== 'active') {
      throw new AppError(409, 'INVALID_TIMER_STATE', `Cannot confirm timer in ${timer.status} state`);
    }

    await db
      .update(watchTimers)
      .set({ status: 'confirmed' })
      .where(eq(watchTimers.id, watchId));

    logger.info({ userId, watchId }, 'Watch Me timer confirmed safe');

    return {
      id: timer.id,
      endsAt: timer.endsAt,
      status: 'confirmed',
      createdAt: timer.createdAt,
    };
  }
}

export const watchService = new WatchService();

