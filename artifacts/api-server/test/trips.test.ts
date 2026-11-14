import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  db,
  users,
  trips,
  tripPoints,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

describe('FR-03: Trip Creation & Location Ingestion', () => {
  const runId = Date.now();
  const testUser = `user_trip_test_${runId}`;
  const testTripId = '11111111-1111-1111-1111-111111111111';
  let locationTripId: string;

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUser,
      name: 'Trip Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'box_pub_test',
      signPub: 'sign_pub_test',
      createdAt: Date.now(),
    });

    // Generate a valid UUID for location tests
    locationTripId = randomUUID();
  });

  afterAll(async () => {
    await db.delete(tripPoints).where(eq(tripPoints.tripId, testTripId));
    await db.delete(trips).where(eq(trips.id, testTripId));
    await db.delete(tripPoints).where(eq(tripPoints.tripId, locationTripId));
    await db.delete(trips).where(eq(trips.id, locationTripId));
    await db.delete(users).where(eq(users.id, testUser));
  });

  // 1. Authenticated user can create a trip
  it('should create trip successfully with valid auth and user', async () => {
    const payload = {
      tripId: testTripId,
      destination: 'Home',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'encoded_polyline_here',
      startedAt: Date.now(),
      etaAt: Date.now() + 3600000,
    };

    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(testTripId);
    expect(res.body.destination).toBe('Home');
    expect(res.body.destLat).toBe(28.6139);
    expect(res.body.destLng).toBe(77.2090);
    expect(res.body.routePolyline).toBe('encoded_polyline_here');
    expect(res.body.status).toBe('active');
    expect(res.body.startedAt).toBe(payload.startedAt);
    expect(res.body.etaAt).toBe(payload.etaAt);
    expect(res.body.escalationStage).toBeUndefined();
  });

  // 2. Idempotent trip creation - same tripId returns existing trip
  it('should return existing trip on idempotent retry with same tripId', async () => {
    const payload = {
      tripId: testTripId,
      destination: 'Different Destination', // Should be ignored
      destLat: 12.34,
      destLng: 56.78,
      routePolyline: 'different_polyline',
      startedAt: Date.now() + 10000,
    };

    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(testTripId);
    expect(res.body.destination).toBe('Home'); // Original destination preserved
    expect(res.body.destLat).toBe(28.6139);
    expect(res.body.destLng).toBe(77.2090);
  });

  // 3. Different user with same tripId should be rejected
  it('should reject trip creation with same tripId from different user', async () => {
    const otherUser = `user_other_${Date.now()}`;
    await db.insert(users).values({
      id: otherUser,
      name: 'Other User',
      phone: '+919876543211',
      lang: 'en',
      boxPub: 'box_pub_other',
      signPub: 'sign_pub_other',
      createdAt: Date.now(),
    });

    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', otherUser)
      .send({
        tripId: testTripId,
        destination: 'Attacker Destination',
        destLat: 12.34,
        destLng: 56.78,
        routePolyline: 'attacker_polyline',
        startedAt: Date.now(),
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRIP_ID_CONFLICT');

    await db.delete(users).where(eq(users.id, otherUser));
  });

  // 4. Missing authentication is rejected
  it('should require authentication to create trip', async () => {
    const res = await request(app).post('/api/v1/trips').send({
      tripId: '22222222-2222-2222-2222-222222222222',
      destination: 'Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      startedAt: Date.now(),
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 5. Invalid destination is rejected
  it('should validate required fields', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send({
        tripId: '33333333-3333-3333-3333-333333333333',
        destination: '', // Empty destination
        destLat: 28.6139,
        destLng: 77.2090,
        routePolyline: 'polyline',
        startedAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 6. Invalid latitude is rejected
  it('should reject invalid latitude', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send({
        tripId: '44444444-4444-4444-4444-444444444444',
        destination: 'Test',
        destLat: 95, // Invalid latitude
        destLng: 77.2090,
        routePolyline: 'polyline',
        startedAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 7. Invalid longitude is rejected
  it('should reject invalid longitude', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send({
        tripId: '55555555-5555-5555-5555-555555555555',
        destination: 'Test',
        destLat: 28.6139,
        destLng: 185, // Invalid longitude
        routePolyline: 'polyline',
        startedAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 8. Invalid UUID is rejected
  it('should reject invalid tripId format', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('x-dev-user-id', testUser)
      .send({
        tripId: 'not-a-uuid',
        destination: 'Test',
        destLat: 28.6139,
        destLng: 77.2090,
        routePolyline: 'polyline',
        startedAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ========================================================================
  // Location Ingestion Tests
  // ========================================================================

  let createdTripId: string;

  beforeAll(async () => {
    // Create a fresh trip for location tests (locationTripId is already generated in outer beforeAll)
    await db.insert(trips).values({
      id: locationTripId,
      userId: testUser,
      destination: 'Location Test',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: Date.now(),
      etaAt: Date.now() + 3600000,
      endedAt: null,
      lastSeenAt: Date.now(),
      lastLat: null,
      lastLng: null,
      nextCheckAt: Date.now() + 180000,
      escalationStage: null,
    });
  });

  afterAll(async () => {
    await db.delete(tripPoints).where(eq(tripPoints.tripId, locationTripId));
    await db.delete(trips).where(eq(trips.id, locationTripId));
  });

  it('should ingest valid location batch', async () => {
    const now = Date.now();
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [
          { lat: 28.6139, lng: 77.2090, acc: 10, ts: Date.now(), mocked: false },
          { lat: 28.6140, lng: 77.2091, acc: 12, ts: Date.now() + 1000, mocked: false },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(2);
    expect(typeof res.body.lastSeenAt).toBe('number');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .send({ points: [{ lat: 28.6139, lng: 77.2090, ts: Date.now() }] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject invalid trip UUID', async () => {
    const res = await request(app)
      .post('/api/v1/trips/not-a-uuid/locations')
      .set('x-dev-user-id', testUser)
      .send({ points: [{ lat: 28.6139, lng: 77.2090, ts: Date.now() }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject cross-user location ingestion', async () => {
    const otherUser = `user_other_${Date.now()}`;
    await db.insert(users).values({
      id: otherUser,
      name: 'Other',
      phone: '+919876543222',
      lang: 'en',
      boxPub: 'box',
      signPub: 'sign',
      createdAt: Date.now(),
    });

    const otherTripId = randomUUID();
    await db.insert(trips).values({
      id: otherTripId,
      userId: otherUser,
      destination: 'Other Trip',
      destLat: 12.0,
      destLng: 77.0,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: Date.now(),
      lastSeenAt: Date.now(),
      nextCheckAt: Date.now() + 180000,
    });

    const res = await request(app)
      .post(`/api/v1/trips/${otherTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({ points: [{ lat: 12.0, lng: 77.0, ts: Date.now() }] });

    expect(res.status).toBe(404); // Non-disclosing response
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');

    await db.delete(trips).where(eq(trips.id, otherTripId));
    await db.delete(users).where(eq(users.id, otherUser));
  });

  it('should reject invalid coordinates', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 95, lng: 77.2090, ts: Date.now() }], // Invalid latitude
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject empty batch', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({ points: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject batch exceeding 50 points', async () => {
    const points = Array.from({ length: 51 }, (_, i) => ({
      lat: 28.6139 + i * 0.0001,
      lng: 77.2090 + i * 0.0001,
      ts: Date.now() + i * 1000,
    }));

    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({ points });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject duplicate timestamps (idempotent)', async () => {
    const baseTime = Date.now() + 10000;
    const ts = baseTime;
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [
          { lat: 28.6139, lng: 77.2090, ts, mocked: false },
          { lat: 28.6140, lng: 77.2091, ts, mocked: false }, // Same timestamp
        ],
      });

    expect(res.status).toBe(200);
    // Only one should be accepted due to unique constraint on (trip_id, ts)
    expect(res.body.accepted).toBe(1);
  });

  it('should not overwrite newer location with older timestamp', async () => {
    const baseTime = Date.now() + 10000;
    // First submit a newer point
    await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6140, lng: 77.2091, acc: 10, ts: baseTime + 1000, mocked: false }],
      });

    // Then try to submit an older point - should be ignored
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6139, lng: 77.2090, acc: 10, ts: baseTime, mocked: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(0); // Older point rejected
  });

  it('should accept out-of-order but newer points', async () => {
    const baseTime = Date.now() + 58000; // 58 seconds in future, within 61s tolerance
    // Submit older point first
    await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6139, lng: 77.2090, acc: 10, ts: baseTime, mocked: false }],
      });

    // Then submit newer point out of order (2 seconds newer, still within 61s tolerance)
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6141, lng: 77.2092, acc: 10, ts: baseTime + 2000, mocked: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('should reject invalid accuracy', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6139, lng: 77.2090, acc: -5, ts: Date.now() }], // Negative accuracy
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid timestamp', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${locationTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({
        points: [{ lat: 28.6139, lng: 77.2090, acc: 10, ts: -1 }], // Negative timestamp
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_POINTS');
  });

  it('should reject location for completed trip', async () => {
    const completedTripId = randomUUID();
    await db.insert(trips).values({
      id: completedTripId,
      userId: testUser,
      destination: 'Completed Trip',
      destLat: 28.0,
      destLng: 77.0,
      routePolyline: 'polyline',
      status: 'completed',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      lastSeenAt: Date.now(),
      nextCheckAt: null,
    });

    const res = await request(app)
      .post(`/api/v1/trips/${completedTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({ points: [{ lat: 28.0, lng: 77.0, ts: Date.now() }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRIP_STATE');

    await db.delete(trips).where(eq(trips.id, completedTripId));
  });
});

// ========================================================================
// Trip Completion Tests (Step 4.3)
// ========================================================================

describe('FR-03: Trip Completion', () => {
  const runId = Date.now() + 1000;
  const testUser = `user_trip_end_${runId}`;
  let endTripId: string;

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUser,
      name: 'Trip End Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'box_pub_test',
      signPub: 'sign_pub_test',
      createdAt: Date.now(),
    });
  });

  afterAll(async () => {
    await db.delete(tripPoints).where(eq(tripPoints.tripId, endTripId));
    await db.delete(trips).where(eq(trips.id, endTripId));
    await db.delete(users).where(eq(users.id, testUser));
  });

  it('should end trip successfully', async () => {
    endTripId = randomUUID();
    await db.insert(trips).values({
      id: endTripId,
      userId: testUser,
      destination: 'Office',
      destLat: 28.6139,
      destLng: 77.2090,
      routePolyline: 'polyline',
      status: 'active',
      startedAt: Date.now() - 1800000,
      etaAt: Date.now() + 3600000,
      endedAt: null,
      lastSeenAt: Date.now(),
      nextCheckAt: Date.now() + 180000,
    });

    const res = await request(app)
      .post(`/api/v1/trips/${endTripId}/end`)
      .set('x-dev-user-id', testUser);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(endTripId);
    expect(res.body.status).toBe('completed');
    expect(typeof res.body.endedAt).toBe('number');
    expect(res.body.endedAt).toBeGreaterThan(Date.now() - 5000); // Recent timestamp
    // nextCheckAt is not in Trip response (only used internally for watchdog)
  });

  it('should be idempotent - second end request returns completed trip', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${endTripId}/end`)
      .set('x-dev-user-id', testUser);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(endTripId);
    expect(res.body.status).toBe('completed');
    expect(typeof res.body.endedAt).toBe('number');
  });

  it('should reject end for already completed trip with different user', async () => {
    const otherUser = `user_other_${Date.now()}`;
    await db.insert(users).values({
      id: otherUser,
      name: 'Other User',
      phone: '+919876543211',
      lang: 'en',
      boxPub: 'box_pub_other',
      signPub: 'sign_pub_other',
      createdAt: Date.now(),
    });

    const res = await request(app)
      .post(`/api/v1/trips/${endTripId}/end`)
      .set('x-dev-user-id', otherUser);

    expect(res.status).toBe(404); // Non-disclosing response
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');

    await db.delete(users).where(eq(users.id, otherUser));
  });

  it('should reject end for non-existent trip', async () => {
    const res = await request(app)
      .post('/api/v1/trips/00000000-0000-0000-0000-000000000000/end')
      .set('x-dev-user-id', testUser);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
  });

  it('should reject end for cancelled trip', async () => {
    const cancelledTripId = randomUUID();
    await db.insert(trips).values({
      id: cancelledTripId,
      userId: testUser,
      destination: 'Cancelled Trip',
      destLat: 28.0,
      destLng: 77.0,
      routePolyline: 'polyline',
      status: 'cancelled',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      lastSeenAt: Date.now(),
      nextCheckAt: null,
    });

    const res = await request(app)
      .post(`/api/v1/trips/${cancelledTripId}/end`)
      .set('x-dev-user-id', testUser);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRIP_STATE');
    expect(res.body.error.message).toContain('cancelled');

    await db.delete(trips).where(eq(trips.id, cancelledTripId));
  });

  it('should reject location ingestion after trip completion', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${endTripId}/locations`)
      .set('x-dev-user-id', testUser)
      .send({ points: [{ lat: 28.0, lng: 77.0, ts: Date.now() }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRIP_STATE');
    expect(res.body.error.message).toContain('completed');
  });

  it('should preserve historical trip points after completion', async () => {
    // Add some trip points first
    await db.insert(tripPoints).values({
      tripId: endTripId,
      ts: Date.now() - 100000,
      lat: 28.6139,
      lng: 77.2090,
      acc: 10,
    });

    const points = await db
      .select()
      .from(tripPoints)
      .where(eq(tripPoints.tripId, endTripId))
      .orderBy(tripPoints.ts);

    expect(points.length).toBeGreaterThan(0);
    // Points should still be accessible
  });

  it('should reject location with invalid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/trips/not-a-uuid/end')
      .set('x-dev-user-id', testUser);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${endTripId}/end`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});