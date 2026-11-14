import { Router } from 'express';
import { requireTickSecret } from '../../middleware/tickSecret.js';
import { tickLimiter } from '../../middleware/rateLimits.js';
import { watchdogWorker } from '../../workers/watchdog.js';
import { cleanupWorker } from '../../workers/cleanup.js';
import { quotaCheckWorker } from '../../workers/quotaCheck.js';
import { relayWorker } from '../../workers/relay.js';

export const internalRouter = Router();

// Protect internal tick endpoint with rate limiting and constant-time secret check
internalRouter.use(tickLimiter);
internalRouter.use(requireTickSecret);

/**
 * POST /internal/tick
 * FR-03, FR-05, TRD 8.4: Run due watchdog checks using SELECT ... FOR UPDATE SKIP LOCKED
 * Invoked by cron-job.org (every 1 min) and GitHub Actions (every 5 min).
 * Also runs cleanup and quota check workers.
 */
internalRouter.post('/tick', async (req, res, next) => {
  try {
    const rawSource = typeof req.body?.source === 'string' ? req.body.source.trim() : 'cron';
    const source = ['cron', 'github', 'in_process', 'boot_catch_up'].includes(rawSource)
      ? rawSource
      : 'cron';

    // Run watchdog checks
    const watchdogResult = await watchdogWorker.runDueChecks(source);

    const relayRecovery = await relayWorker.recoverExpiredLeases();
    const relayResult = await relayWorker.runDueJobs();

    // Run cleanup worker (idempotent, safe to run on every tick)
    // Runs quickly - only deletes rows older than retention thresholds
    await cleanupWorker.runNightlyCleanup();

    // Run quota check worker
    const quotaResult = await quotaCheckWorker.checkQuotas();

    // Maintain backward compatibility with existing response structure
    res.status(200).json({
      status: 'ok',
      source,
      tripsChecked: watchdogResult.tripsChecked,
      escalatedCount: watchdogResult.escalatedCount,
      timestamp: Date.now(),
      // New nested structure for extended info
      watchdog: {
        tripsChecked: watchdogResult.tripsChecked,
        escalatedCount: watchdogResult.escalatedCount,
      },
      cleanup: { status: 'completed' },
      quota: {
        databaseSizeMb: quotaResult.databaseSizeMb,
        orsDirectionsCountToday: quotaResult.orsDirectionsCountToday,
      },
      relay: { ...relayResult, recoveredLeases: relayRecovery },
    });
  } catch (error) {
    // Log the actual error for debugging
    console.error('[Internal Tick] Error:', error);
    next(error);
  }
});

