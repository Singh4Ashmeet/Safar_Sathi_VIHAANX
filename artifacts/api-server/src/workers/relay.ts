import { pool } from '@workspace/db';
import { logger } from '../lib/logger.js';
import { relayService } from '../modules/relay/service.js';
import { env } from '../config/env.js';

const LEASE_MS = 30_000;
const BATCH_SIZE = 20;
const MAX_RETRIES = 5;

export interface RelayWorkerResult {
  claimed: number;
  completed: number;
  retried: number;
  exhausted: number;
  errors: number;
}

export interface RelayWorkerHealth {
  running: boolean;
  lastRunAt: number | null;
  lastRunResult: RelayWorkerResult | null;
  consecutiveFailures: number;
}

/** Durable relay-SOS processing worker. Physical BLE forwarding remains mobile-owned. */
export class RelayWorker {
  private running = false;
  private shuttingDown = false;
  private lastRunAt: number | null = null;
  private lastRunResult: RelayWorkerResult | null = null;
  private consecutiveFailures = 0;

  getHealth(): RelayWorkerHealth {
    return {
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /** Signal graceful shutdown - finishes current batch then stops accepting new work. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    // Wait for current run to complete (with timeout)
    const start = Date.now();
    while (this.running && Date.now() - start < 10_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    logger.info({ shutdown: true }, '[Relay] Worker shutdown complete');
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async runDueJobs(now = Date.now()): Promise<RelayWorkerResult> {
    if (this.running || this.shuttingDown) {
      return { claimed: 0, completed: 0, retried: 0, exhausted: 0, errors: 0 };
    }
    this.running = true;
    const client = await pool.connect();
    const result: RelayWorkerResult = { claimed: 0, completed: 0, retried: 0, exhausted: 0, errors: 0 };
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `UPDATE relay_packets
         SET processing_status = 'processing', lease_until = $1, updated_at = $2
         WHERE event_id IN (
           SELECT event_id FROM relay_packets
           WHERE status = 'accepted'
             AND processing_status = 'pending'
             AND next_attempt_at <= $2
             AND (lease_until IS NULL OR lease_until < $2)
           ORDER BY next_attempt_at, received_at
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
           RETURNING event_id, lease_until`,
        [now + LEASE_MS, now, BATCH_SIZE]
      );
      await client.query('COMMIT');
      result.claimed = claimed.rows.length;

      for (const row of claimed.rows) {
        try {
          const outcome = await relayService.processPending(row.event_id, Number(row.lease_until));
          if (outcome === 'completed') result.completed++;
          else if (outcome === 'retry') result.retried++;
          else result.exhausted++;
        } catch (jobError) {
          // Isolate malformed job failures - log and continue with other jobs
          result.errors++;
          logger.error(
            { eventId: row.event_id, err: jobError },
            '[Relay] Individual job failed, continuing with next job'
          );
          // Attempt to mark the job as retryable if it was a transient error
          try {
            await pool.query(
              `UPDATE relay_packets
               SET processing_status = 'pending', lease_until = NULL, next_attempt_at = $1, updated_at = $1
               WHERE event_id = $2 AND processing_status = 'processing' AND lease_until = $3`,
              [now + 60_000, row.event_id, row.lease_until]
            );
          } catch {
            // Best effort - if this fails, lease recovery will handle it
          }
        }
      }

      this.lastRunAt = now;
      this.lastRunResult = result;
      this.consecutiveFailures = 0;
      logger.info({ ...result }, '[Relay] Durable relay worker sweep completed');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.consecutiveFailures++;
      logger.error({ err: error, consecutiveFailures: this.consecutiveFailures }, '[Relay] Durable relay worker sweep failed');
      throw error;
    } finally {
      client.release();
      this.running = false;
    }
  }

  async recoverExpiredLeases(now = Date.now()): Promise<number> {
    const result = await pool.query(
      `UPDATE relay_packets
       SET processing_status = 'pending', lease_until = NULL, next_attempt_at = LEAST(next_attempt_at, $1), updated_at = $1
       WHERE processing_status = 'processing' AND lease_until IS NOT NULL AND lease_until < $1
       RETURNING event_id`,
      [now]
    );
    const recovered = result.rowCount ?? 0;
    if (recovered > 0) {
      logger.info({ recovered }, '[Relay] Recovered expired leases');
    }
    return recovered;
  }

  /** Get configurable worker parameters for observability. */
  getConfig(): { leaseMs: number; batchSize: number; maxRetries: number } {
    return { leaseMs: LEASE_MS, batchSize: BATCH_SIZE, maxRetries: MAX_RETRIES };
  }
}

export const relayWorker = new RelayWorker();
