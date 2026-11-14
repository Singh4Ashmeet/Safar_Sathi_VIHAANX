import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { runBootCatchUp } from './workers/catchUp.js';
import { watchdogWorker } from './workers/watchdog.js';
import { pool } from '@workspace/db';
import { createShutdownHandler } from './lib/shutdown.js';
import { relayWorker } from './workers/relay.js';

const server = app.listen(env.PORT, async () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, '🚀 SafarSaathi 2.0 API server started');

  // Boot-time catch-up sweep (TRD 8.4)
  try {
    await runBootCatchUp();
  } catch (err) {
    logger.error({ err }, 'Error during boot catch-up sweep');
  }

  // 15-second in-process loop while the server is awake (TRD 8.4)
  const watchdogInterval = setInterval(async () => {
    try {
      await watchdogWorker.runDueChecks('in_process');
    } catch (err) {
      logger.error({ err }, 'In-process watchdog sweep encountered an error');
    }
    try {
      await relayWorker.recoverExpiredLeases();
      await relayWorker.runDueJobs();
    } catch (err) {
      logger.error({ err }, 'In-process relay sweep encountered an error');
    }
  }, 15000);

  // Set bounded HTTP server timeouts (TRD T16)
  server.requestTimeout = 30000;
  server.headersTimeout = 35000;

  // Graceful shutdown handling
  const shutdown = createShutdownHandler({
    server,
    closeDatabase: async () => {
      // Gracefully stop relay worker first
      try {
        await relayWorker.shutdown();
      } catch (err) {
        logger.error({ err }, 'Error shutting down relay worker');
      }
      await pool.end();
    },
    intervals: [watchdogInterval],
    timeoutMs: 10000,
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});

