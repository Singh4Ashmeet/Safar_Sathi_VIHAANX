import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db, shareLinks, sosEvents, users } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { sha256 } from '../src/lib/crypto.js';

describe('SOS tracking authorization', () => {
  const userId = `sos_tracking_${Date.now()}`;
  const sosId = 'd0d0d0d0-e0e0-4f0f-8a0a-000000000001';
  const token = `tracking-token-${Date.now()}`;

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, name: 'Tracking User', phone: '+919876543210', lang: 'en', boxPub: 'box', signPub: 'sign', createdAt: Date.now() });
    await db.insert(sosEvents).values({
      id: sosId, userId, trigger: 'ble_relay', duress: false, status: 'active', source: 'ble_gateway',
      createdAt: Date.now(), receivedAt: Date.now(), lastLat: 28.6139, lastLng: 77.209, locationAccuracyM: 10, battery: 80, lastLocationAt: Date.now(),
    });
    await db.insert(shareLinks).values({ tokenHash: sha256(token), sosId, guardianId: null, expiresAt: Date.now() + 60_000, createdAt: Date.now() });
  });

  afterAll(async () => {
    await db.delete(shareLinks).where(eq(shareLinks.sosId, sosId));
    await db.delete(sosEvents).where(eq(sosEvents.id, sosId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('serves authorized SOS location through the existing public tracking contract', async () => {
    const response = await request(app).get(`/public/track/${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userName: 'Tracking User', tripStatus: 'sos_active', lastLat: 28.6139, lastLng: 77.209 });
  });

  it('accepts live location batch updates for active SOS', async () => {
    const response = await request(app)
      .post(`/api/v1/sos/${sosId}/locations`)
      .set('x-dev-user-id', userId)
      .send({
        points: [
          { lat: 28.6145, lng: 77.2095, acc: 8, ts: Date.now() }
        ]
      });
    expect(response.status).toBe(200);
    expect(response.body.accepted).toBe(1);

    // Verify coordinates updated in public track response
    const trackRes = await request(app).get(`/public/track/${token}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.lastLat).toBe(28.6145);
    expect(trackRes.body.lastLng).toBe(77.2095);
  });

  it('serves SOS status with per-guardian delivery tracking', async () => {
    const response = await request(app)
      .get(`/api/v1/sos/${sosId}`)
      .set('x-dev-user-id', userId);
    expect(response.status).toBe(200);
    expect(response.body.sosId).toBe(sosId);
    expect(response.body.status).toBe('active');
    expect(Array.isArray(response.body.deliveries)).toBe(true);
  });
});
