/**
 * Helpers for client-UUID idempotent inserts (FR-06, FR-12, TRD section 9).
 * Client-generated UUIDv4 guarantees offline queue replay safety.
 */

export interface IdempotentResult<T> {
  entity: T;
  isDuplicate: boolean;
}

/**
 * Handle idempotent insertion pattern for client-provided UUIDs.
 * If record with `id` exists, return it; otherwise insert.
 */
export async function handleIdempotentInsert<T>(
  findFn: () => Promise<T | null | undefined>,
  insertFn: () => Promise<T>
): Promise<IdempotentResult<T>> {
  const existing = await findFn();
  if (existing) {
    return {
      entity: existing,
      isDuplicate: true,
    };
  }

  const inserted = await insertFn();
  return {
    entity: inserted,
    isDuplicate: false,
  };
}

