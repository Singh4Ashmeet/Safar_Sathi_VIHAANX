import { watchdogWorker } from './watchdog.js';
import { logger } from '../lib/logger.js';

/**
 * Boot-time catch-up sweep (TRD 8.4).
 * Runs immediately on server startup to catch any trips or timers that became due
 * while the server was asleep or restarting on the free tier.
 */
export async function runBootCatchUp(): Promise<void> {
  logger.info('[CatchUp] Running boot-time catch-up sweep...');
  try {
    const result = await watchdogWorker.runDueChecks('boot_catch_up');
    logger.info(
      { tripsChecked: result.tripsChecked, escalatedCount: result.escalatedCount },
      '[CatchUp] Boot catch-up completed'
    );
  } catch (err) {
    logger.error({ err }, '[CatchUp] Boot catch-up sweep encountered an error');
  }
}

