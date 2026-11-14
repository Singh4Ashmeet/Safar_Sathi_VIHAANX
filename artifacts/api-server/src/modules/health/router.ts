import { Router } from 'express';
import { pool } from '@workspace/db';
import { db, tickLog } from '@workspace/db';
import { desc } from 'drizzle-orm';
import { nowEpochMs, diffSeconds } from '../../lib/time.js';

export const healthRouter = Router();

/**
 * Executes a promise with a hard timeout to prevent hanging health/readiness checks.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * GET /api/healthz (and alias /healthz)
 * Liveness probe: returns 200 OK if server process is running.
 * Lightweight: does not connect to or require database.
 */
healthRouter.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'safarsaathi-api',
    uptimeSec: Math.floor(process.uptime()),
    timestamp: nowEpochMs(),
  });
});

/**
 * GET /api/readyz (and alias /readyz)
 * Readiness probe: checks database ping + last-tick age (TRD 8.4, 8.6)
 * Degraded (HTTP 503) if database fails, times out, or if no tick has arrived in > 3 minutes (180s).
 */
healthRouter.get('/readyz', async (_req, res) => {
  const now = nowEpochMs();
  try {
    // 1. Ping database with bounded timeout (2000ms)
    await withTimeout(pool.query('SELECT 1'), 2000, 'Database ping timeout');

    // 2. Check last tick age with bounded timeout (2000ms)
    const lastTicks = await withTimeout(
      db
        .select()
        .from(tickLog)
        .orderBy(desc(tickLog.receivedAt))
        .limit(1),
      2000,
      'Tick check query timeout'
    );

    let tickStatus: 'ok' | 'degraded' | 'no_ticks' = 'ok';
    let lastTickAgeSec: number | null = null;

    if (lastTicks.length > 0 && lastTicks[0]) {
      lastTickAgeSec = diffSeconds(now, lastTicks[0].receivedAt);
      if (lastTickAgeSec > 180) {
        tickStatus = 'degraded';
      }
    } else {
      tickStatus = 'no_ticks';
    }

    const isReady = tickStatus !== 'degraded';
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'degraded',
      database: 'connected',
      watchdogTick: tickStatus,
      lastTickAgeSec,
      timestamp: now,
    });
  } catch (_error) {
    // Sanitize: do not leak internal connection string, credentials or stack traces
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      watchdogTick: 'unknown',
      lastTickAgeSec: null,
      error: 'Database connection failed or timed out',
      timestamp: now,
    });
  }
});

