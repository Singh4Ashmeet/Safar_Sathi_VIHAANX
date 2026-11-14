import type { Server } from 'node:http';
import { logger } from './logger.js';

export interface ShutdownDependencies {
  server: Server;
  closeDatabase: () => Promise<void>;
  intervals?: (NodeJS.Timeout | number)[];
  timeoutMs?: number;
}

/**
 * Creates a graceful shutdown handler that:
 * 1. Stops accepting new incoming connections.
 * 2. Allows in-flight requests a bounded period to finish.
 * 3. Clears recurring background intervals.
 * 4. Closes database pool connections.
 * 5. Enforces a maximum bounded timeout to prevent hanging.
 */
export function createShutdownHandler(deps: ShutdownDependencies) {
  let isShuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    isShuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully...');

    // Clear background intervals
    if (deps.intervals) {
      for (const interval of deps.intervals) {
        clearInterval(interval);
      }
    }

    // Force exit timer so process never hangs indefinitely
    const forceExitTimer = setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, deps.timeoutMs ?? 10000);
    forceExitTimer.unref();

    // Close HTTP server
    await new Promise<void>((resolve) => {
      deps.server.close((err) => {
        if (err) {
          logger.error({ err }, 'Error closing HTTP server');
        } else {
          logger.info('HTTP server closed');
        }
        resolve();
      });
    });

    // Close database pool connections
    try {
      await deps.closeDatabase();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }

    clearTimeout(forceExitTimer);
    process.exit(0);
  };
}

