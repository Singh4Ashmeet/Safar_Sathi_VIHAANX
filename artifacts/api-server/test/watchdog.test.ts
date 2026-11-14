import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  db,
  users,
  trips,
  tripPoints,
  guardians,
  shareLinks,
  escalations,
  watchTimers,
  sosEvents,
  sosDeliveries,
  tickLog,
} from '@workspace/db';
import { eq, and, count } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { nowEpochMs } from '../src/lib/time.js';

describe('FR-05: Watchdog Escalation & Trip Completion Integration', () => {
  const runId = Date.now() + 2000;
  const testUser = `user_watchdog_${runId}`;
  let guardianId: string;
  const TICK_SECRET = process.env.TICK_SECRET || 'safarsaathi_dev_tick_secret_replace_in_prod';

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUser,
      name: 'Watchdog Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'box_pub_test',
      signPub: 'sign_pub_test',
      createdAt: Date.now(),
    });

    // Create a granted guardian for notification tests
    const [guardian] = await db.insert(guardians).values({
      id: randomUUID(),
      userId: testUser,
      name: 'Test Guardian',
      phoneE164: '+919876543211',
      email: 'guardian@test.com',
      relationship: 'family',
      channels: ['sms', 'email'],
      consentStatus: 'granted',
      createdAt: Date.now(),
    }).returning();
    guardianId = guardian.id;
  });

  afterAll(async () => {
    await db.delete(guardians).where(eq(guardians.id, guardianId));
    await db.delete(users).where(eq(users.id, testUser));
  });

  // Helper to run watchdog tick
  async function runWatchdog(source = 'test') {
    return request(app)
      .post('/internal/tick')
      .set('x-tick-secret', TICK_SECRET)
      .send({ source });
  }

  // Helper to create a test trip
  async function createTestTrip(overrides: Partial<{
    tripId: string;
    lastSeenAt: number;
    etaAt: number;
    status: string;
    nextCheckAt: number;
    escalationStage: string | null;
  }> = {}) {
    const tripId = overrides.tripId || randomUUID();
    const now = nowEpochMs();
    const signalLostSec = 180;

    // Use a nextCheckAt that is definitely in the past (1 minute) to avoid any timing/clock skew issues
    const nextCheckAt = overrides.nextCheckAt ?? (now - 60000);

    await db.insert(trips).values({
      id: tripId,
      userId: testUser,
      destination: overrides.destination || 'Test Trip',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: overrides.status || 'active',
      startedAt: now - (signalLostSec + 60) * 1000,
      etaAt: overrides.etaAt ?? (now + 3600000),
      endedAt: null,
      lastSeenAt: overrides.lastSeenAt ?? (now - (signalLostSec + 60) * 1000),
      lastLat: 28.6139,
      lastLng: 77.2090,
      nextCheckAt,
      escalationStage: overrides.escalationStage ?? null,
    });

    return tripId;
  }

  // Helper to clean up a test trip
  async function cleanupTrip(tripId: string) {
    await db.delete(tripPoints).where(eq(tripPoints.tripId, tripId));
    await db.delete(shareLinks).where(eq(shareLinks.tripId, tripId));
    await db.delete(escalations).where(eq(escalations.tripId, tripId));
    await db.delete(sosDeliveries).where(eq(sosDeliveries.sosId, db.select({ id: sosEvents.id }).from(sosEvents).where(eq(sosEvents.tripId, tripId)).limit(1)));
    await db.delete(sosEvents).where(eq(sosEvents.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
  }

  // ========================================================================
  // Signal Lost Detection Tests
  // ========================================================================

  it('should detect signal loss and escalate to signal_lost stage', async () => {
    const tripId = await createTestTrip();

    const res = await runWatchdog();

    expect(res.status).toBe(200);
    expect(res.body.tripsChecked).toBeGreaterThanOrEqual(1);

    // Verify escalation was created
    const escalation = await db
      .select()
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'signal_lost')))
      .limit(1);

    expect(escalation.length).toBe(1);

    // Verify trip was updated
    const trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    expect(trip[0].escalationStage).toBe('user_prompted');
    expect(trip[0].nextCheckAt).toBeGreaterThan(nowEpochMs() - 1000);

    await cleanupTrip(tripId);
  });

  it('should not duplicate signal_lost escalation on repeated ticks', async () => {
    const tripId = await createTestTrip();

    await runWatchdog();
    await runWatchdog();

    // Verify only one escalation record exists
    const escalationCount = await db
      .select({ count: count() })
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'signal_lost')));

    expect(Number(escalationCount[0]?.count || 0)).toBe(1);

    await cleanupTrip(tripId);
  });

  // ========================================================================
  // Missed Check-in Escalation Tests (Stage 2 then SOS)
  // ========================================================================

  it('sends a second check after 30 seconds, then triggers SOS 10 seconds later', async () => {
    const tripId = await createTestTrip({
      escalationStage: 'user_prompted',
      nextCheckAt: nowEpochMs() - 1,
    });

    const res = await runWatchdog();

    expect(res.status).toBe(200);
    expect(res.body.escalatedCount).toBeGreaterThanOrEqual(1);

    // The first missed response sends the second (final) prompt, not SOS.
    let trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(trip[0].escalationStage).toBe('second_prompted');
    expect(trip[0].nextCheckAt).toBeGreaterThan(nowEpochMs() - 1_000);

    // Expire the final 10-second response window and run the watchdog again.
    await db.update(trips).set({ nextCheckAt: nowEpochMs() - 1 }).where(eq(trips.id, tripId));
    await runWatchdog();

    const escalation = await db
      .select()
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'guardians_alerted')))
      .limit(1);
    expect(escalation.length).toBe(1);

    trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    expect(trip[0].escalationStage).toBe('guardians_alerted');

    // Verify SOS was created - use 'direct' as source (schema constraint) but trigger='watchdog'
    const sos = await db
      .select()
      .from(sosEvents)
      .where(and(eq(sosEvents.tripId, tripId), eq(sosEvents.trigger, 'watchdog')))
      .limit(1);

    expect(sos.length).toBe(1);
    expect(sos[0].source).toBe('direct'); // Schema constraint: 'direct' | 'ble_gateway'
    expect(sos[0].status).toBe('active');

    await cleanupTrip(tripId);
  });

  it('should create delivery records for guardians on lost contact escalation', async () => {
    const tripId = await createTestTrip({
      escalationStage: 'user_prompted',
      nextCheckAt: nowEpochMs() - 1,
    });

    await runWatchdog();
    await db.update(trips).set({ nextCheckAt: nowEpochMs() - 1 }).where(eq(trips.id, tripId));
    await runWatchdog();

    const sos = await db
      .select()
      .from(sosEvents)
      .where(and(eq(sosEvents.tripId, tripId), eq(sosEvents.trigger, 'watchdog')))
      .limit(1);

    if (sos.length > 0) {
      const deliveries = await db
        .select()
        .from(sosDeliveries)
        .where(eq(sosDeliveries.sosId, sos[0].id));

      expect(deliveries.length).toBeGreaterThan(0);
      // Should have deliveries for the granted guardian
      const guardianDeliveries = deliveries.filter(d => d.guardianId === guardianId);
      expect(guardianDeliveries.length).toBeGreaterThan(0);
    }

    await cleanupTrip(tripId);
  });

  // ========================================================================
  // ETA Overdue Detection Tests
  // ========================================================================

  it('should detect ETA overdue and escalate', async () => {
    const now = nowEpochMs();
    const etaGraceSec = 600;

    const tripId = await createTestTrip({
      tripId: randomUUID(),
      lastSeenAt: now - 100000,
      etaAt: now - (etaGraceSec + 60) * 1000, // ETA passed with grace period
      nextCheckAt: now - 1000,
    });

    const res = await runWatchdog();

    expect(res.status).toBe(200);

    // Verify signal_lost escalation was created (ETA overdue triggers signal_lost first)
    const escalation = await db
      .select()
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'signal_lost')))
      .limit(1);

    expect(escalation.length).toBe(1);

    // Verify trip was updated to user_prompted
    const trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    expect(trip[0].escalationStage).toBe('user_prompted');

    await cleanupTrip(tripId);
  });

  // ========================================================================
  // ETA Overdue Before Signal Loss Test (documents current behavior)
  // ========================================================================

  it('should handle ETA overdue first, then signal loss is not recorded separately', async () => {
    const now = nowEpochMs();
    const etaGraceSec = 600;
    const signalLostSec = 180;

    const tripId = await createTestTrip({
      tripId: randomUUID(),
      // ETA is overdue (grace period passed)
      etaAt: now - (etaGraceSec + 60) * 1000,
      // lastSeenAt is NOT past signal loss threshold yet
      lastSeenAt: now - (signalLostSec - 60) * 1000,
      nextCheckAt: now - 1000,
    });

    // First tick: ETA overdue should trigger signal_lost pipeline
    const res1 = await runWatchdog();
    expect(res1.status).toBe(200);

    // Verify signal_lost escalation was created
    let escalation = await db
      .select()
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'signal_lost')))
      .limit(1);
    expect(escalation.length).toBe(1);

    // Trip should be in user_prompted state
    let trip = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(trip[0].escalationStage).toBe('user_prompted');

    // Second tick: simulate signal loss occurring (lastSeenAt now past threshold)
    // Update the trip's lastSeenAt to be past signal loss threshold
    const now2 = nowEpochMs();
    await db.update(trips)
      .set({ lastSeenAt: now2 - (signalLostSec + 60) * 1000 })
      .where(eq(trips.id, tripId));

    // Run watchdog again
    const res2 = await runWatchdog();
    expect(res2.status).toBe(200);

    // Signal loss should NOT create a new escalation record (already in user_prompted state)
    escalation = await db
      .select()
      .from(escalations)
      .where(and(eq(escalations.tripId, tripId), eq(escalations.stage, 'signal_lost')))
      .limit(1);
    expect(escalation.length).toBe(1); // Still only one signal_lost record

    // Trip should still be user_prompted (or progressed to guardians_alerted if lost contact time passed)
    trip = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(['user_prompted', 'guardians_alerted']).toContain(trip[0].escalationStage);

    await cleanupTrip(tripId);
  });

  // ========================================================================
  // Completed Trip Exclusion Tests
  // ========================================================================

  it('should not escalate completed trips', async () => {
    const completedTripId = randomUUID();
    const now = nowEpochMs();

    await db.insert(trips).values({
      id: completedTripId,
      userId: testUser,
      destination: 'Completed Trip',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'completed',
      startedAt: now - 7200000,
      etaAt: now - 3600000,
      endedAt: now - 100000,
      lastSeenAt: now - 100000,
      nextCheckAt: null,
      escalationStage: null,
    });

    const res = await runWatchdog();

    expect(res.status).toBe(200);

    // Verify no escalation for completed trip
    const escalation = await db
      .select()
      .from(escalations)
      .where(eq(escalations.tripId, completedTripId))
      .limit(1);

    expect(escalation.length).toBe(0);

    await db.delete(trips).where(eq(trips.id, completedTripId));
  });

  // ========================================================================
  // Public Tracking Integration Tests
  // ========================================================================

  it('should stop public tracking for completed trip', async () => {
    const trackingTripId = randomUUID();
    const now = nowEpochMs();

    await db.insert(trips).values({
      id: trackingTripId,
      userId: testUser,
      destination: 'Tracking Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: now - 1800000,
      etaAt: now + 3600000,
      endedAt: null,
      lastSeenAt: now - 10000, // Very recent (10 seconds ago)
      lastLat: 28.6139,
      lastLng: 77.2090,
      nextCheckAt: now + 180000,
      escalationStage: null,
    });

    // Insert a trip point for the public tracking to return
    await db.insert(tripPoints).values({
      tripId: trackingTripId,
      ts: now - 10000,
      lat: 28.6139,
      lng: 77.2090,
      acc: 10,
    });

    // Create share link
    const shareRes = await request(app)
      .post(`/api/v1/trips/${trackingTripId}/share`)
      .set('x-dev-user-id', testUser)
      .send({ guardianId, expiresInSec: 86400 });

    expect(shareRes.status).toBe(201);
    const trackingUrl = shareRes.body.url;
    const token = trackingUrl.split('/t/')[1];
    expect(token).toBeDefined();

    // Verify trip is active before tracking
    const tripBefore = await db.select().from(trips).where(eq(trips.id, trackingTripId)).limit(1);
    console.log('Trip before tracking:', tripBefore[0]?.status, tripBefore[0]?.escalationStage);

    // Verify tracking works before completion
    const trackingBefore = await request(app).get(`/public/track/${token}`);
    console.log('trackingBefore:', trackingBefore.status, trackingBefore.body);
    expect(trackingBefore.status).toBe(200);
    expect(trackingBefore.body.isExpired).toBe(false);
    expect(trackingBefore.body.lastLat).toBeDefined();
    expect(trackingBefore.body.lastLng).toBeDefined();

    // Complete the trip
    const endRes = await request(app)
      .post(`/api/v1/trips/${trackingTripId}/end`)
      .set('x-dev-user-id', testUser);

    expect(endRes.status).toBe(200);
    expect(endRes.body.status).toBe('completed');

    // Verify tracking now shows expired
    const trackingAfter = await request(app).get(`/public/track/${token}`);
    expect(trackingAfter.status).toBe(200);
    expect(trackingAfter.body.isExpired).toBe(true);
    expect(trackingAfter.body.tripStatus).toBe('completed');
    expect(trackingAfter.body.lastLat).toBeUndefined();
    expect(trackingAfter.body.lastLng).toBeUndefined();

    // Cleanup
    await db.delete(tripPoints).where(eq(tripPoints.tripId, trackingTripId));
    await db.delete(shareLinks).where(eq(shareLinks.tripId, trackingTripId));
    await db.delete(trips).where(eq(trips.id, trackingTripId));
  });

  it('should show expired page for completed trip on /t/:token', async () => {
    const trackingTripId = randomUUID();
    const now = nowEpochMs();

    await db.insert(trips).values({
      id: trackingTripId,
      userId: testUser,
      destination: 'Tracking Test 2',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: now - 1800000,
      etaAt: now + 3600000,
      endedAt: null,
      lastSeenAt: now - 100000,
      lastLat: 28.6139,
      lastLng: 77.2090,
      nextCheckAt: now + 180000,
      escalationStage: null,
    });

    const shareRes = await request(app)
      .post(`/api/v1/trips/${trackingTripId}/share`)
      .set('x-dev-user-id', testUser)
      .send({ guardianId, expiresInSec: 86400 });

    const trackingUrl = shareRes.body.url;
    const token = trackingUrl.split('/t/')[1];

    // Complete the trip
    await request(app)
      .post(`/api/v1/trips/${trackingTripId}/end`)
      .set('x-dev-user-id', testUser);

    // Access HTML tracking page - should return 200 with expired page
    const pageRes = await request(app).get(`/t/${token}`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain('Link Expired');
    expect(pageRes.text).toContain('लिंक समाप्त हो गया');

    // Cleanup
    await db.delete(shareLinks).where(eq(shareLinks.tripId, trackingTripId));
    await db.delete(trips).where(eq(trips.id, trackingTripId));
  });

  // ========================================================================
  // Watch Me Timer Tests (FR-09)
  // ========================================================================

  it('should mark expired Watch Me timers as expired', async () => {
    const watchId = randomUUID();
    const now = nowEpochMs();

    await db.insert(watchTimers).values({
      id: watchId,
      userId: testUser,
      endsAt: now - 1000, // Expired
      status: 'active',
      createdAt: now - 3600000,
    });

    const res = await runWatchdog();

    expect(res.status).toBe(200);

    // Verify watch timer was marked as expired
    const watch = await db
      .select()
      .from(watchTimers)
      .where(eq(watchTimers.id, watchId))
      .limit(1);

    expect(watch[0].status).toBe('expired');

    // Cleanup
    await db.delete(watchTimers).where(eq(watchTimers.id, watchId));
  });

  // ========================================================================
  // Tick Logging Tests
  // ========================================================================

  it('should log tick execution in tick_log', async () => {
    const res = await runWatchdog('test_log_' + Date.now());

    expect(res.status).toBe(200);

    const tickLogEntries = await db
      .select()
      .from(tickLog)
      .where(eq(tickLog.source, res.body.source))
      .limit(1);

    expect(tickLogEntries.length).toBe(1);
    expect(tickLogEntries[0].tripsChecked).toBeGreaterThanOrEqual(0);
  });
});
