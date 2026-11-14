import crypto from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Derives a deterministic 64-bit signed integer (PostgreSQL bigint) for pg_advisory_xact_lock
 * using cryptographically secure SHA-256.
 *
 * Collision analysis:
 * - SHA-256 produces 256 bits of cryptographic entropy.
 * - Truncating to the first 64 bits (BigInt64BE) yields a keyspace of 2^64 (~1.84 x 10^19).
 * - Prefix 'safarsaathi:user_lock:' namespaces the key away from any other database advisory locks.
 */
export function deriveUserLockKey(userId: string): bigint {
  const hash = crypto
    .createHash('sha256')
    .update(`safarsaathi:user_lock:${userId}`)
    .digest();
  return hash.readBigInt64BE(0);
}

/**
 * Returns the SQL expression to acquire a transaction-scoped advisory lock in PostgreSQL.
 * Transaction-scoped advisory locks (pg_advisory_xact_lock) are automatically released
 * when the enclosing transaction commits or rolls back, preventing leaked locks.
 */
export function userAdvisoryLockSql(userId: string): SQL {
  const lockKey = deriveUserLockKey(userId);
  return sql`SELECT pg_advisory_xact_lock(${lockKey})`;
}

/**
 * Executes a database operation with bounded retries for transient PostgreSQL
 * concurrency errors:
 * - 40P01: deadlock detected
 * - 40001: serialization failure
 *
 * Retries the entire transaction with exponential backoff and jitter.
 * Non-transient validation, constraint, or authorization errors are never retried.
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      attempt++;
      return await operation();
    } catch (err: any) {
      const code = err?.code || err?.cause?.code;
      const isRetryable = code === '40P01' || code === '40001';

      if (isRetryable && attempt < maxAttempts) {
        const delayMs = Math.min(50 * Math.pow(2, attempt - 1) + Math.random() * 25, 500);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}
