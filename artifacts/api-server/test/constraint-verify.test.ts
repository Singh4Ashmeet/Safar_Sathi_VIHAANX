import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, escalations, trips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

describe('Database Constraint Verification', () => {
  const testUser = `constraint_test_${Date.now()}`;

  beforeAll(async () => {
    // Insert test user
    await db.insert(await import('@workspace/db').then(m => m.users)).values({
      id: testUser,
      name: 'Constraint Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'box_pub_test',
      signPub: 'sign_pub_test',
      createdAt: Date.now(),
    });
  });

  afterAll(async () => {
    await db.delete(await import('@workspace/db').then(m => m.users)).where(eq((await import('@workspace/db').then(m => m.users)).id, testUser));
  });

  it('should have unique constraint on (trip_id, stage) in escalations', async () => {
    const tripId = randomUUID();
    const now = Date.now();

    // Create a trip
    await db.insert(trips).values({
      id: tripId,
      userId: testUser,
      destination: 'Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: now - 3600000,
      etaAt: now + 3600000,
      endedAt: null,
      lastSeenAt: now - 100000,
      nextCheckAt: now + 180000,
    });

    // First insertion should succeed
    await db.insert(escalations).values({
      tripId,
      stage: 'signal_lost',
      firedAt: now,
    });

    // Second insertion with same trip_id and stage should fail
    let error: Error | null = null;
    try {
      await db.insert(escalations).values({
        tripId,
        stage: 'signal_lost',
        firedAt: now + 1000,
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain('duplicate key value violates unique constraint');

    // Cleanup
    await db.delete(escalations).where(eq(escalations.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
  });

  it('should allow different stages for same trip_id', async () => {
    const tripId = randomUUID();
    const now = Date.now();

    await db.insert(trips).values({
      id: tripId,
      userId: testUser,
      destination: 'Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: now - 3600000,
      etaAt: now + 3600000,
      endedAt: null,
      lastSeenAt: now - 100000,
      nextCheckAt: now + 180000,
    });

    // Insert signal_lost
    await db.insert(escalations).values({
      tripId,
      stage: 'signal_lost',
      firedAt: now,
    });

    // Insert guardians_alerted should succeed
    await db.insert(escalations).values({
      tripId,
      stage: 'guardians_alerted',
      firedAt: now + 1000,
    });

    // Verify both exist
    const escalationRecords = await db.select().from(escalations).where(eq(escalations.tripId, tripId));
    expect(escalationRecords.length).toBe(2);

    const stages = escalationRecords.map(e => e.stage).sort();
    expect(stages).toEqual(['guardians_alerted', 'signal_lost']);

    // Cleanup
    await db.delete(escalations).where(eq(escalations.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
  });

  it('should have check constraint on stage values', async () => {
    const tripId = randomUUID();
    const now = Date.now();

    await db.insert(trips).values({
      id: tripId,
      userId: testUser,
      destination: 'Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: now - 3600000,
      etaAt: now + 3600000,
      endedAt: null,
      lastSeenAt: now - 100000,
      nextCheckAt: now + 180000,
    });

    // Invalid stage should fail
    let error: Error | null = null;
    try {
      await db.insert(escalations).values({
        tripId,
        stage: 'invalid_stage',
        firedAt: now,
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain('check constraint');

    // Valid stages should succeed
    for (const stage of ['signal_lost', 'user_prompted', 'guardians_alerted'] as const) {
      const tripId2 = randomUUID();
      await db.insert(trips).values({
        id: tripId2,
        userId: testUser,
        destination: 'Test',
        destLat: 28.6139,
        destLng: 77.2090,
        routePolyline: 'polyline',
        status: 'active',
        startedAt: now - 3600000,
        etaAt: now + 3600000,
        endedAt: null,
        lastSeenAt: now - 100000,
        nextCheckAt: now + 180000,
      });

      await db.insert(escalations).values({
        tripId: tripId2,
        stage,
        firedAt: now,
      });

      const records = await db.select().from(escalations).where(eq(escalations.tripId, tripId2));
      expect(records.length).toBe(1);
      expect(records[0].stage).toBe(stage);

      await db.delete(escalations).where(eq(escalations.tripId, tripId2));
      await db.delete(trips).where(eq(trips.id, tripId2));
    }

    // Cleanup
    await db.delete(escalations).where(eq(escalations.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
  });
});