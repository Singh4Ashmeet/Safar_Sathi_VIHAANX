import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, relayPackets } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { RelayWorker } from '../src/workers/relay.js';
import { relayService } from '../src/modules/relay/service.js';

describe('Phase 5.3 durable relay worker', () => {
  const eventId = 'b0b0b0b0-c0c0-4d0d-8e0e-000000000001';
  const worker = new RelayWorker();
  const activeEventId = 'b0b0b0b0-c0c0-4d0d-8e0e-000000000002';

  beforeAll(async () => {
    await db.insert(relayPackets).values({
      eventId,
      raw: Buffer.alloc(192).toString('base64'),
      destTag: '0102030405060708',
      receivedAt: Date.now(),
      status: 'accepted',
      processingStatus: 'processing',
      attempts: 1,
      nextAttemptAt: 0,
      leaseUntil: Date.now() - 1,
      updatedAt: Date.now(),
    }).onConflictDoNothing();
    await db.insert(relayPackets).values({
      eventId: activeEventId,
      raw: Buffer.alloc(192).toString('base64'),
      destTag: '0102030405060708',
      receivedAt: Date.now(),
      status: 'accepted',
      processingStatus: 'processing',
      attempts: 1,
      nextAttemptAt: 0,
      leaseUntil: Date.now() + 60_000,
      updatedAt: Date.now(),
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(relayPackets).where(eq(relayPackets.eventId, eventId));
    await db.delete(relayPackets).where(eq(relayPackets.eventId, activeEventId));
  });

  it('recovers expired leases instead of leaving work stranded', async () => {
    const recovered = await worker.recoverExpiredLeases(Date.now());
    expect(recovered).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
    expect(row.processingStatus).toBe('pending');
    expect(row.leaseUntil).toBeNull();
  });

  it('does not reclaim an active lease', async () => {
    const recovered = await worker.recoverExpiredLeases(Date.now());
    expect(recovered).toBe(0);
    const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, activeEventId));
    expect(row.processingStatus).toBe('processing');
  });

  it('does not allow a stale lease holder to mutate a newer lease', async () => {
    const [before] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, activeEventId));
    await relayService.processPending(activeEventId, Number(before.leaseUntil) - 1);
    const [after] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, activeEventId));
    expect(after.processingStatus).toBe('processing');
    expect(after.attempts).toBe(before.attempts);
    expect(after.leaseUntil).toBe(before.leaseUntil);
  });

  it('claims malformed durable work without crashing the worker', async () => {
    const result = await worker.runDueJobs(Date.now() + 1);
    expect(result.claimed).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
    expect(['pending', 'exhausted']).toContain(row.processingStatus);
    expect(row.attempts).toBeGreaterThan(1);
  });

  it('enforces the terminal exhausted state at the retry limit', async () => {
    await db.update(relayPackets).set({ processingStatus: 'processing', attempts: 4, leaseUntil: Date.now() - 1, nextAttemptAt: 0 }).where(eq(relayPackets.eventId, eventId));
    await worker.recoverExpiredLeases(Date.now());
    await worker.runDueJobs(Date.now() + 2);
    const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
    expect(row.processingStatus).toBe('exhausted');
    expect(row.attempts).toBe(5);
  });
});
