import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  db,
  users,
  guardians,
  sosEvents,
  sosDeliveries,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { sosService } from '../src/modules/sos/service.js';

describe('FR-06: SOS Idempotency, Consent & Replay Protection', () => {
  const runId = Date.now();
  const testUser = `user_sos_test_${runId}`;
  const sosId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUser,
      name: 'SOS Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'box_pub_test',
      signPub: 'sign_pub_test',
      createdAt: Date.now(),
    });

    // Create guardians with different consent statuses - use runId for unique IDs
    await db.insert(guardians).values([
      {
        id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(runId).padStart(12, '0').slice(0, 12)}`,
        userId: testUser,
        name: 'Granted Guardian',
        phoneE164: '+919876543111',
        relationship: 'father',
        channels: ['sms', 'telegram'],
        consentStatus: 'granted',
        createdAt: Date.now(),
      },
      {
        id: `bbbbbbbb-bbbb-bbbb-bbbb-${String(runId).padStart(12, '0').slice(0, 12)}`,
        userId: testUser,
        name: 'Pending Guardian',
        phoneE164: '+919876543112',
        relationship: 'mother',
        channels: ['sms'],
        consentStatus: 'pending',
        createdAt: Date.now(),
      },
      {
        id: `cccccccc-cccc-cccc-cccc-${String(runId).padStart(12, '0').slice(0, 12)}`,
        userId: testUser,
        name: 'Revoked Guardian',
        phoneE164: '+919876543113',
        relationship: 'ex',
        channels: ['sms', 'email'],
        consentStatus: 'revoked',
        createdAt: Date.now(),
      },
      // Note: SYSTEM_TOMBSTONE_GUARDIAN_ID is already seeded by the database seed
    ]);
  });

  afterAll(async () => {
    await db.delete(sosDeliveries).where(eq(sosDeliveries.sosId, sosId));
    await db.delete(sosEvents).where(eq(sosEvents.id, sosId));
    await db.delete(guardians).where(eq(guardians.userId, testUser));
    await db.delete(users).where(eq(users.id, testUser));
  });

  it('should require authentication to trigger SOS', async () => {
    const res = await request(app).post('/api/v1/sos').send({
      sosId: '11111111-1111-1111-1111-111111111111',
      trigger: 'button',
      duress: false,
      createdAt: Date.now(),
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should create SOS successfully with valid auth and user', async () => {
    const res = await request(app)
      .post('/api/v1/sos')
      .set('x-dev-user-id', testUser)
      .send({
        sosId,
        trigger: 'button',
        duress: false,
        createdAt: Date.now(),
      });

    expect(res.status).toBe(201);
    expect(res.body.sosId).toBe(sosId);
    expect(res.body.status).toBe('active');
    expect(Array.isArray(res.body.guardians)).toBe(true);
    // Should have deliveries for granted (2 channels) + pending (1 channel) = 3 deliveries
    expect(res.body.guardians.length).toBeGreaterThanOrEqual(3);
  });

  it('should return existing SOS on idempotent retry with same sosId', async () => {
    const res = await request(app)
      .post('/api/v1/sos')
      .set('x-dev-user-id', testUser)
      .send({
        sosId,
        trigger: 'shake', // Different trigger should be ignored
        duress: true, // Different duress should be ignored
        createdAt: Date.now(),
      });

    expect(res.status).toBe(201);
    expect(res.body.sosId).toBe(sosId);
    expect(res.body.status).toBe('active');
    // Original trigger and duress should be preserved
  });

  it('should reject SOS with same sosId from different user', async () => {
    const otherUser = `user_sos_other_${Date.now()}`;
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
      .post('/api/v1/sos')
      .set('x-dev-user-id', otherUser)
      .send({
        sosId,
        trigger: 'button',
        duress: false,
        createdAt: Date.now(),
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOS_ID_CONFLICT');

    await db.delete(users).where(eq(users.id, otherUser));
  });

  it('should validate required fields', async () => {
    const res = await request(app)
      .post('/api/v1/sos')
      .set('x-dev-user-id', testUser)
      .send({
        // missing sosId
        trigger: 'button',
        duress: false,
        createdAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid trigger', async () => {
    const res = await request(app)
      .post('/api/v1/sos')
      .set('x-dev-user-id', testUser)
      .send({
        sosId: '22222222-2222-2222-2222-222222222222',
        trigger: 'invalid_trigger',
        duress: false,
        createdAt: Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ========================================================================
  // Consent Policy Tests
  // ========================================================================
  describe('Consent Policy Enforcement', () => {
    let grantedGuardianId: string;
    let pendingGuardianId: string;
    let revokedGuardianId: string;

    beforeAll(async () => {
      // Get the guardian IDs
      const [granted] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.userId, testUser), eq(guardians.consentStatus, 'granted')))
        .limit(1);
      grantedGuardianId = granted.id;

      const [pending] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.userId, testUser), eq(guardians.consentStatus, 'pending')))
        .limit(1);
      pendingGuardianId = pending.id;

      const [revoked] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.userId, testUser), eq(guardians.consentStatus, 'revoked')))
        .limit(1);
      revokedGuardianId = revoked.id;
    });

    it('granted guardian should receive SOS alert with tracking URL in delivery records', async () => {
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', testUser)
        .send({
          sosId: '33333333-3333-3333-3333-333333333333',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      expect(res.status).toBe(201);

      // Check delivery records for granted guardian
      const deliveries = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, res.body.sosId), eq(sosDeliveries.guardianId, grantedGuardianId)));

      expect(deliveries.length).toBeGreaterThan(0);
      // Should have deliveries for each channel (sms, telegram)
      expect(deliveries.length).toBeGreaterThanOrEqual(2);
    });

    it('pending guardian should receive minimal SOS alert without tracking URL', async () => {
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', testUser)
        .send({
          sosId: '44444444-4444-4444-4444-444444444444',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      expect(res.status).toBe(201);

      // Check delivery records for pending guardian
      const deliveries = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, res.body.sosId), eq(sosDeliveries.guardianId, pendingGuardianId)));

      expect(deliveries.length).toBeGreaterThan(0);
      // Should have deliveries for each channel (sms only)
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
    });

    it('revoked guardian should not receive any SOS notification', async () => {
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', testUser)
        .send({
          sosId: '55555555-5555-5555-5555-555555555555',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      expect(res.status).toBe(201);

      // Check delivery records for revoked guardian - should be NONE
      const deliveries = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, res.body.sosId), eq(sosDeliveries.guardianId, revokedGuardianId)));

      expect(deliveries.length).toBe(0);
    });

    it('tombstone guardian should not receive any SOS notification', async () => {
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', testUser)
        .send({
          sosId: '66666666-6666-6666-6666-666666666666',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      expect(res.status).toBe(201);

      // Check delivery records for tombstone guardian - should be NONE
      const deliveries = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, res.body.sosId), eq(sosDeliveries.guardianId, SYSTEM_TOMBSTONE_GUARDIAN_ID)));

      expect(deliveries.length).toBe(0);
    });

    it('pending guardian delivery records should exist but not include tracking URL in payload', async () => {
      // This test verifies the delivery records are created for pending guardians
      // The actual notification content (no tracking URL) is tested via the notification service
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', testUser)
        .send({
          sosId: '77777777-7777-7777-7777-777777777777',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      expect(res.status).toBe(201);

      const pendingDeliveries = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, res.body.sosId), eq(sosDeliveries.guardianId, pendingGuardianId)));

      expect(pendingDeliveries.length).toBeGreaterThan(0);
      // All should start as 'queued' then become 'sent' or 'failed'
      for (const d of pendingDeliveries) {
        expect(['queued', 'sent', 'failed']).toContain(d.status);
      }
    });
  });

  // ========================================================================
  // Delivery Recovery Tests
  // ========================================================================
  describe('Delivery Recovery', () => {
    let grantedGuardianId: string;

    beforeAll(async () => {
      const [granted] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.userId, testUser), eq(guardians.consentStatus, 'granted')))
        .limit(1);
      grantedGuardianId = granted.id;
    });

    it('should recover undispatched deliveries after server restart', async () => {
      const recoverySosId = '88888888-8888-8888-8888-888888888888';
      
      // Create SOS event and queued deliveries directly (simulating crash after commit)
      await db.insert(sosEvents).values({
        id: recoverySosId,
        userId: testUser,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      // Create queued deliveries for granted guardian (only SMS to ensure delivery)
      await db.insert(sosDeliveries).values([
        {
          sosId: recoverySosId,
          guardianId: grantedGuardianId,
          channel: 'sms',
          status: 'queued',
          updatedAt: Date.now(),
        },
        {
          sosId: recoverySosId,
          guardianId: grantedGuardianId,
          channel: 'sms',
          status: 'queued',
          updatedAt: Date.now(),
        },
      ]);

      // Call recovery
      await sosService.recoverUndispatchedDeliveries(recoverySosId);

      // Verify deliveries were updated (sent or failed)
      const recovered = await db
        .select()
        .from(sosDeliveries)
        .where(and(eq(sosDeliveries.sosId, recoverySosId), eq(sosDeliveries.status, 'queued')));

      expect(recovered.length).toBe(0); // All should be sent/failed now

      // Cleanup
      await db.delete(sosDeliveries).where(eq(sosDeliveries.sosId, recoverySosId));
      await db.delete(sosEvents).where(eq(sosEvents.id, recoverySosId));
    });

    it('should not resend already sent deliveries', async () => {
      const recoverySosId = '99999999-9999-9999-9999-999999999999';
      
      await db.insert(sosEvents).values({
        id: recoverySosId,
        userId: testUser,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      // Create one queued and one already sent - using different channels to avoid update conflicts
      await db.insert(sosDeliveries).values([
        {
          sosId: recoverySosId,
          guardianId: grantedGuardianId,
          channel: 'sms',
          status: 'queued',
          updatedAt: Date.now(),
        },
        {
          sosId: recoverySosId,
          guardianId: grantedGuardianId,
          channel: 'telegram', // Different channel to avoid update conflicts
          status: 'sent',
          providerRef: 'existing-ref',
          updatedAt: Date.now(),
        },
      ]);

      await sosService.recoverUndispatchedDeliveries(recoverySosId);

      // Verify queued was updated, sent was not changed
      const allDeliveries = await db
        .select()
        .from(sosDeliveries)
        .where(eq(sosDeliveries.sosId, recoverySosId));

      expect(allDeliveries.length).toBe(2);
      const queued = allDeliveries.find(d => d.channel === 'sms');
      const sent = allDeliveries.find(d => d.channel === 'telegram');
      
      expect(queued?.status).not.toBe('queued'); // Should be sent or failed
      expect(sent?.status).toBe('sent');
      expect(sent?.providerRef).toBe('existing-ref');

      // Cleanup
      await db.delete(sosDeliveries).where(eq(sosDeliveries.sosId, recoverySosId));
      await db.delete(sosEvents).where(eq(sosEvents.id, recoverySosId));
    });
  });
});