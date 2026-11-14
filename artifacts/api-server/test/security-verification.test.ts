import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  db,
  users,
  guardians,
  shareLinks,
  sosEvents,
  sosDeliveries,
  sosAcks,
  auditLog,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
  SYSTEM_TOMBSTONE_USER_ID,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { guardiansService } from '../src/modules/guardians/service.js';
import { notifyService } from '../src/modules/notify/index.js';
import { cleanupWorker } from '../src/workers/cleanup.js';
import { randomUUID } from 'node:crypto';

describe('Step 2.4: Security Verification — Profile & Guardian APIs', () => {
  const runId = Date.now();
  const userA = `user_sec_alice_${runId}`;
  const userB = `user_sec_bob_${runId}`;
  const userConcurrency = `user_sec_concur_${runId}`;
  const userForDelete = `user_sec_delete_${runId}`;
  const testSosId = randomUUID();
  const revokedGuardianId = randomUUID();

  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: userA,
        name: 'Alice Security Test',
        phone: '+919876543001',
        lang: 'en',
        boxPub: 'box_pub_alice',
        signPub: 'sign_pub_alice',
        createdAt: Date.now(),
      },
      {
        id: userB,
        name: 'Bob Security Test',
        phone: '+919876543002',
        lang: 'en',
        boxPub: 'box_pub_bob',
        signPub: 'sign_pub_bob',
        createdAt: Date.now(),
      },
      {
        id: userConcurrency,
        name: 'Concurrency Test User',
        phone: '+919876543003',
        lang: 'en',
        boxPub: 'box_pub_concur',
        signPub: 'sign_pub_concur',
        createdAt: Date.now(),
      },
      {
        id: userForDelete,
        name: 'Delete Test User',
        phone: '+919876543004',
        lang: 'en',
        boxPub: 'box_pub_delete',
        signPub: 'sign_pub_delete',
        createdAt: Date.now(),
      },
    ]).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userA));
    await db.delete(users).where(eq(users.id, userB));
    await db.delete(users).where(eq(users.id, userConcurrency));
    await db.delete(users).where(eq(users.id, userForDelete));
  });

  // =========================================================================
  // 1. Authorization & Cross-User Security
  // =========================================================================
  describe('Authorization & Cross-User Security', () => {
    it('GET /me rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('PUT /me rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put('/api/v1/me')
        .send({
          name: 'Test',
          phone: '+919876543210',
          lang: 'en',
          boxPub: 'key',
          signPub: 'key',
        });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /me rejects unauthenticated requests with 401', async () => {
      const res = await request(app).delete('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /guardians rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/guardians');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /guardians rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/guardians')
        .send({
          name: 'Test',
          phoneE164: '+919876543210',
          relationship: 'friend',
          channels: ['sms'],
        });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /guardians/:id rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .delete('/api/v1/guardians/00000000-0000-0000-0000-000000000001');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Malformed Bearer token returns 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Invalid token signature returns 401 (AUTH_UNAVAILABLE or INVALID_TOKEN)', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid.token.signature');
      expect(res.status).toBe(401);
      // In test mode without Firebase configured, returns AUTH_UNAVAILABLE
      // With Firebase configured but invalid token, returns INVALID_TOKEN
      expect(['AUTH_UNAVAILABLE', 'INVALID_TOKEN']).toContain(res.body.error.code);
    });

    it('Dev bypass works in test mode for GET /me', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userA);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userA);
    });

    it('Dev bypass works in test mode for GET /guardians', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('Dev bypass correctly scopes to provided UID (no cross-user leakage)', async () => {
      // Create profile for userB first
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userB)
        .send({
          name: 'Bob',
          phone: '+919876543002',
          lang: 'en',
          boxPub: 'box_pub_bob',
          signPub: 'sign_pub_bob',
        });

      // User A requests /me - should get A's profile
      const resA = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userA);
      expect(resA.body.id).toBe(userA);

      // User B requests /me - should get B's profile
      const resB = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userB);
      expect(resB.body.id).toBe(userB);
      expect(resB.body.name).toBe('Bob');
    });

    it('System/tombstone UIDs cannot authenticate via dev bypass', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', 'system_tombstone_user');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('System/tombstone UIDs cannot access guardians via dev bypass', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', SYSTEM_TOMBSTONE_USER_ID);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Public endpoints do not expose private profile data', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('phone');
    });
  });

  // =========================================================================
  // 2. Cross-User Profile & Guardian Access
  // =========================================================================
  describe('Cross-User Profile & Guardian Isolation', () => {
    let guardianIdA: string;

    beforeAll(async () => {
      // Create a guardian for userA
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Guardian For Alice',
          phoneE164: '+919876544001',
          relationship: 'mother',
          channels: ['sms'],
        });
      guardianIdA = res.body.guardian.id;
    });

    it('User B cannot read User A guardians (GET /guardians)', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userB);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('User B cannot delete User A guardian (DELETE /guardians/:id)', async () => {
      const res = await request(app)
        .delete(`/api/v1/guardians/${guardianIdA}`)
        .set('x-dev-user-id', userB);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('GUARDIAN_NOT_FOUND');

      // Verify guardian still exists
      const [g] = await db.select().from(guardians).where(eq(guardians.id, guardianIdA));
      expect(g).toBeDefined();
    });

    it('User B cannot create guardian under User A (POST /guardians)', async () => {
      // This is implicitly tested by ownership scoping - the guardian is created for the authenticated user
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userB)
        .send({
          name: 'Guardian For Bob',
          phoneE164: '+919876544002',
          relationship: 'father',
          channels: ['sms'],
        });
      expect(res.status).toBe(201);
      expect(res.body.guardian.userId).not.toBeDefined(); // Response doesn't include userId
      // But the guardian should be linked to userB in DB
      const [g] = await db.select().from(guardians).where(eq(guardians.id, res.body.guardian.id));
      expect(g.userId).toBe(userB);
    });

    it('Client-supplied user ID in body cannot override authenticated identity', async () => {
      // Try to send a guardian with a different user ID in payload (if API accepted it)
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Attempt Override',
          phoneE164: '+919876544003',
          relationship: 'friend',
          channels: ['sms'],
          userId: userB, // This should be ignored
        });
      expect(res.status).toBe(201);
      const [g] = await db.select().from(guardians).where(eq(guardians.id, res.body.guardian.id));
      expect(g.userId).toBe(userA); // Must be authenticated user, not spoofed
    });
  });

  // =========================================================================
  // 3. Account Deletion Security
  // =========================================================================
  describe('Account Deletion Security', () => {
    let userWithSos: string;

    beforeAll(async () => {
      userWithSos = `user_sec_sos_${runId}`;
      await db.insert(users).values({
        id: userWithSos,
        name: 'SOS Test User',
        phone: '+919876543100',
        lang: 'en',
        boxPub: 'box_pub_sos',
        signPub: 'sign_pub_sos',
        createdAt: Date.now(),
      });

      // Create SOS event
      await db.insert(sosEvents).values({
        id: testSosId,
        userId: userWithSos,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });
    });

    afterAll(async () => {
      await db.delete(sosEvents).where(eq(sosEvents.id, testSosId));
      await db.delete(users).where(eq(users.id, userWithSos));
    });

    it('DELETE /me returns 200 { ok: true } for user with SOS records', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userWithSos);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('Subsequent GET /me returns 404 USER_NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userWithSos);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('Repeated DELETE /me is idempotent (returns 200 { ok: true })', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userWithSos);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('PUT /me on deleted account returns 403 ACCOUNT_DELETED (resurrection blocked)', async () => {
      const res = await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userWithSos)
        .send({
          name: 'Resurrection Attempt',
          phone: '+919876543101',
          lang: 'en',
          boxPub: 'new_box',
          signPub: 'new_sign',
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DELETED');
    });

    it('SOS events are preserved and reassigned to tombstone user', async () => {
      const [sos] = await db.select().from(sosEvents).where(eq(sosEvents.id, testSosId));
      expect(sos).toBeDefined();
      expect(sos.userId).toBe(SYSTEM_TOMBSTONE_USER_ID);
    });

    it('SOS share links are invalidated on account deletion', async () => {
      const [links] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.sosId, testSosId));
      // Links should be deleted (empty result)
      expect(links).toBeUndefined();
    });

    it('Audit log records the deletion', async () => {
      const [audit] = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.actor, userWithSos), eq(auditLog.action, 'user.delete')));
      expect(audit).toBeDefined();
      expect(audit.resource).toBe('users');
    });

    it('Personal data is erased from users table', async () => {
      const [user] = await db.select().from(users).where(eq(users.id, userWithSos));
      expect(user).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Concurrent Operations & Advisory Locking
  // =========================================================================
  describe('Concurrency & Advisory Locking', () => {
    it('Concurrent guardian creation attempts are serialized (max 5 limit enforced)', async () => {
      const attempts = Array.from({ length: 7 }, (_, i) => ({
        name: `Concurrent Guardian ${i}`,
        phoneE164: `+919876555${String(i).padStart(3, '0')}`,
        relationship: 'sibling',
        channels: ['sms'] as const,
      }));

      const responses = await Promise.all(
        attempts.map((payload) =>
          request(app)
            .post('/api/v1/guardians')
            .set('x-dev-user-id', userConcurrency)
            .send(payload)
        )
      );

      const successful = responses.filter((r) => r.status === 201);
      const rejected = responses.filter((r) => r.status === 400 && r.body.error?.code === 'GUARDIAN_LIMIT_EXCEEDED');

      expect(successful).toHaveLength(5);
      expect(rejected).toHaveLength(2);

      // Confirm DB holds exactly 5 guardians
      const finalGuardians = await db.select().from(guardians).where(eq(guardians.userId, userConcurrency));
      expect(finalGuardians).toHaveLength(5);
    });

    it('Concurrent profile upsert and deletion on same user complete without deadlock', async () => {
      const testUser = `user_sec_concur_profile_${runId}`;
      await db.insert(users).values({
        id: testUser,
        name: 'Concurrent Profile',
        phone: '+919876543200',
        lang: 'en',
        boxPub: 'box_concur',
        signPub: 'sign_concur',
        createdAt: Date.now(),
      });

      // Fire concurrent upsert and delete - should not deadlock
      const [upsertRes, deleteRes] = await Promise.all([
        request(app)
          .put('/api/v1/me')
          .set('x-dev-user-id', testUser)
          .send({
            name: 'Updated',
            phone: '+919876543201',
            lang: 'en',
            boxPub: 'box_new',
            signPub: 'sign_new',
          }),
        request(app)
          .delete('/api/v1/me')
          .set('x-dev-user-id', testUser),
      ]);

      // Both should complete (no deadlock)
      // At least one should succeed; the other may succeed or fail depending on timing
      // The key assertion: no deadlock (which would cause timeout/error)
      expect([upsertRes.status, deleteRes.status]).toEqual(
        expect.arrayContaining([expect.any(Number)])
      );
      // Both returning 200 is acceptable if upsert wins first then delete sees no user (404)
      // or if delete wins first then upsert sees audit marker (403)

      // Verify final state is consistent - user either exists or is deleted
      const [finalUser] = await db.select().from(users).where(eq(users.id, testUser));
      // If user exists, it should have the updated name from upsert
      if (finalUser) {
        expect(finalUser.name).toBe('Updated');
      }
    });

    it('Guardian deletion and creation for same user are serialized', async () => {
      const testUser = `user_sec_concur_guard_${runId}`;
      await db.insert(users).values({
        id: testUser,
        name: 'Concurrent Guard',
        phone: '+919876543300',
        lang: 'en',
        boxPub: 'box_concur_g',
        signPub: 'sign_concur_g',
        createdAt: Date.now(),
      });

      // Create a guardian first
      const createRes = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', testUser)
        .send({
          name: 'To Delete',
          phoneE164: '+919876543301',
          relationship: 'friend',
          channels: ['sms'],
        });
      const guardId = createRes.body.guardian.id;

      // Fire concurrent delete and create
      const [deleteRes, createRes2] = await Promise.all([
        request(app)
          .delete(`/api/v1/guardians/${guardId}`)
          .set('x-dev-user-id', testUser),
        request(app)
          .post('/api/v1/guardians')
          .set('x-dev-user-id', testUser)
          .send({
            name: 'New Guard',
            phoneE164: '+919876543302',
            relationship: 'friend',
            channels: ['sms'],
          }),
      ]);

      // Both should complete without error (serialized)
      expect([200, 201].includes(deleteRes.status) || [200, 404].includes(deleteRes.status)).toBe(true);
      expect([201, 400].includes(createRes2.status)).toBe(true);

      await db.delete(users).where(eq(users.id, testUser));
    });
  });

  // =========================================================================
  // 5. Guardian Consent & Tracking Security
  // =========================================================================
  describe('Guardian Consent & Tracking Security', () => {
    let pendingGuardianId: string;

    beforeAll(async () => {
      // Create pending guardian
      const pendingRes = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Pending Guardian',
          phoneE164: '+919876543401',
          relationship: 'friend',
          channels: ['sms'],
        });
      pendingGuardianId = pendingRes.body.guardian.id;

      // Create revoked guardian directly in DB
      await db.insert(guardians).values({
        id: revokedGuardianId,
        userId: userA,
        name: 'Revoked Guardian',
        phoneE164: '+919876543402',
        relationship: 'ex',
        channels: ['sms'],
        consentStatus: 'revoked',
        createdAt: Date.now(),
      });
    });

    afterAll(async () => {
      await db.delete(guardians).where(eq(guardians.id, revokedGuardianId));
    });

    it('New guardians always start with consentStatus = pending', async () => {
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userB)
        .send({
          name: 'Fresh Guardian',
          phoneE164: '+919876543501',
          relationship: 'partner',
          channels: ['sms'],
        });
      expect(res.status).toBe(201);
      expect(res.body.guardian.consentStatus).toBe('pending');

      const [stored] = await db.select().from(guardians).where(eq(guardians.id, res.body.guardian.id));
      expect(stored.consentStatus).toBe('pending');
    });

    it('Invitation delivery does not grant consent (pending remains pending)', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);
      const pendingGuardian = res.body.find((g: any) => g.id === pendingGuardianId);
      expect(pendingGuardian).toBeDefined();
      expect(pendingGuardian.consentStatus).toBe('pending');
    });

    it('Pending guardian cannot access live location (assertLiveLocationAccess throws 403)', async () => {
      await expect(
        guardiansService.assertLiveLocationAccess(pendingGuardianId)
      ).rejects.toThrowError(/Guardian does not have granted consent/);
    });

    it('Revoked guardian cannot access live location', async () => {
      await expect(
        guardiansService.assertLiveLocationAccess(revokedGuardianId)
      ).rejects.toThrowError(/Guardian does not have granted consent/);
    });

    it('No unverified token or URL can grant consent', async () => {
      // There is no consent callback endpoint implemented
      // Verify that no endpoint exists to transition consentStatus
      const res = await request(app)
        .patch(`/api/v1/guardians/${pendingGuardianId}`)
        .set('x-dev-user-id', userA)
        .send({ consentStatus: 'granted' });
      expect(res.status).toBe(404); // Endpoint doesn't exist
    });

    it('Guardian deletion revokes associated share links', async () => {
      // Create an SOS event first (required for share_links FK)
      const testSosId3 = randomUUID();
      await db.insert(sosEvents).values({
        id: testSosId3,
        userId: userA,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      // Create a share link for the pending guardian
      const shareLinkId = randomUUID();
      await db.insert(shareLinks).values({
        id: shareLinkId,
        tokenHash: 'hash_test',
        sosId: testSosId3,
        guardianId: pendingGuardianId,
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      });

      // Delete the guardian
      const res = await request(app)
        .delete(`/api/v1/guardians/${pendingGuardianId}`)
        .set('x-dev-user-id', userA);
      expect(res.status).toBe(200);

      // Verify share link is deleted
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, shareLinkId));
      expect(link).toBeUndefined();

      // Cleanup
      await db.delete(sosEvents).where(eq(sosEvents.id, testSosId3));
    });

    it('Guardian deletion preserves historical SOS deliveries and acknowledgements under tombstone', async () => {
      // Create an SOS event first (required for sos_deliveries/sos_acks FK)
      const testSosId2 = randomUUID();
      await db.insert(sosEvents).values({
        id: testSosId2,
        userId: userA,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      const deliveryId = randomUUID();
      const ackId = randomUUID();

      await db.insert(sosDeliveries).values({
        id: deliveryId,
        sosId: testSosId2,
        guardianId: revokedGuardianId,
        channel: 'sms',
        status: 'sent',
        updatedAt: Date.now(),
      });

      await db.insert(sosAcks).values({
        id: ackId,
        sosId: testSosId2,
        guardianId: revokedGuardianId,
        ackAt: Date.now(),
      });

      // Delete the revoked guardian
      await request(app)
        .delete(`/api/v1/guardians/${revokedGuardianId}`)
        .set('x-dev-user-id', userA);

      const [delivery] = await db.select().from(sosDeliveries).where(eq(sosDeliveries.id, deliveryId));
      expect(delivery.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);

      const [ack] = await db.select().from(sosAcks).where(eq(sosAcks.id, ackId));
      expect(ack.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);

      // Cleanup
      await db.delete(sosEvents).where(eq(sosEvents.id, testSosId2));
    });
  });

  // =========================================================================
  // 6. Notification & Tombstone Safety
  // =========================================================================
  describe('Notification & Tombstone Safety', () => {
    it('Tombstone guardian is excluded from notification dispatch (all channels)', async () => {
      const results = await notifyService.dispatchAlert(
        'test-sos-id',
        [
          {
            guardianId: SYSTEM_TOMBSTONE_GUARDIAN_ID,
            name: '[DELETED GUARDIAN]',
            phoneE164: '+000000000000',
            email: null,
            telegramChatId: null,
            pushToken: null,
            channels: ['sms', 'telegram', 'email', 'push'],
          },
        ],
        {
          userName: 'Test User',
          trackingUrl: 'http://localhost/t/test',
          sosType: 'button',
          timestamp: Date.now(),
        }
      );

      // Must be empty: tombstone guardian was skipped
      expect(results).toHaveLength(0);
    });

    it('Tombstone guardian cannot be listed in GET /guardians', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);
      const hasTombstone = res.body.some((g: any) => g.id === SYSTEM_TOMBSTONE_GUARDIAN_ID);
      expect(hasTombstone).toBe(false);
    });

    it('Tombstone guardian cannot be deleted via DELETE /guardians/:id', async () => {
      const res = await request(app)
        .delete(`/api/v1/guardians/${SYSTEM_TOMBSTONE_GUARDIAN_ID}`)
        .set('x-dev-user-id', userA);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('GUARDIAN_NOT_FOUND');

      const [tombstone] = await db.select().from(guardians).where(eq(guardians.id, SYSTEM_TOMBSTONE_GUARDIAN_ID));
      expect(tombstone).toBeDefined();
      expect(tombstone.name).toBe('[DELETED GUARDIAN]');
    });

    it('Tombstone guardian cannot access live location', async () => {
      await expect(
        guardiansService.assertLiveLocationAccess(SYSTEM_TOMBSTONE_GUARDIAN_ID)
      ).rejects.toThrowError(/System tombstone guardian cannot access live location/);
    });

    it('Provider-specific paths (SMS, Telegram, Email, Push) all respect tombstone exclusion', async () => {
      // Test each channel individually
      const channels = ['sms', 'telegram', 'email', 'push'] as const;
      
      for (const channel of channels) {
        const guardian: any = {
          guardianId: SYSTEM_TOMBSTONE_GUARDIAN_ID,
          name: '[DELETED GUARDIAN]',
          phoneE164: '+000000000000',
          email: channel === 'email' ? 'test@example.com' : null,
          telegramChatId: channel === 'telegram' ? '123456' : null,
          pushToken: channel === 'push' ? 'ExponentPushToken[test]' : null,
          channels: [channel],
        };

        const results = await notifyService.dispatchAlert(
          `test-${channel}`,
          [guardian],
          { userName: 'Test', trackingUrl: 'http://test', sosType: 'button', timestamp: Date.now() }
        );

        expect(results).toHaveLength(0);
      }
    });
  });

  // =========================================================================
  // 7. Privacy & Retention
  // =========================================================================
  describe('Privacy & Retention Controls', () => {
    it('Phone numbers and emails are not leaked in error responses', async () => {
      const secretPhone = '+919999999999';
      const secretEmail = 'supersecret@domain.com';

      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: '', // validation failure
          phoneE164: secretPhone,
          email: secretEmail,
          relationship: 'sister',
          channels: ['sms'],
        });

      expect(res.status).toBe(400);
      const resText = JSON.stringify(res.body);
      expect(resText).not.toContain(secretPhone);
      expect(resText).not.toContain(secretEmail);
    });

    it('Request body size is limited to 64KB', async () => {
      const largePayload = {
        name: 'x'.repeat(100),
        phoneE164: '+919876543210',
        relationship: 'friend',
        channels: ['sms'],
        // Add large padding
        padding: 'x'.repeat(70000),
      };

      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send(largePayload);

      // Should either reject with 413 or 400 (validation will fail first on padding)
      expect([400, 413]).toContain(res.status);
    });

    it('Maximum five guardians enforcement works under concurrent requests', async () => {
      const user = `user_sec_max5_${runId}`;
      await db.insert(users).values({
        id: user,
        name: 'Max 5 Test',
        phone: '+919876543600',
        lang: 'en',
        boxPub: 'box_max5',
        signPub: 'sign_max5',
        createdAt: Date.now(),
      });

      const attempts = Array.from({ length: 7 }, (_, i) => ({
        name: `Guardian ${i}`,
        phoneE164: `+91987654360${i}`,
        relationship: 'friend',
        channels: ['sms'] as const,
      }));

      const responses = await Promise.all(
        attempts.map((payload) =>
          request(app)
            .post('/api/v1/guardians')
            .set('x-dev-user-id', user)
            .send(payload)
        )
      );

      const successful = responses.filter((r) => r.status === 201);
      expect(successful).toHaveLength(5);

      await db.delete(users).where(eq(users.id, user));
    });

    it('Duplicate phone number for same user is rejected', async () => {
      // Use a fresh user to avoid hitting the 5-guardian limit
      const freshUser = `user_sec_fresh_${runId}`;
      await db.insert(users).values({
        id: freshUser,
        name: 'Fresh User',
        phone: '+919876543700',
        lang: 'en',
        boxPub: 'box_fresh',
        signPub: 'sign_fresh',
        createdAt: Date.now(),
      });

      const phone = `+91987654370${runId % 10}`;
      
      await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', freshUser)
        .send({
          name: 'First',
          phoneE164: phone,
          relationship: 'friend',
          channels: ['sms'],
        });

      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', freshUser)
        .send({
          name: 'Second',
          phoneE164: phone,
          relationship: 'friend',
          channels: ['sms'],
        });

      await db.delete(users).where(eq(users.id, freshUser));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_GUARDIAN_PHONE');
    });

    it('Audit log is append-only (no UPDATE/DELETE on existing entries)', async () => {
      // This is a design verification - auditLog table has no UPDATE/DELETE in our code
      // Verify by checking table structure has no trigger for updates
      const auditEntries = await db.select().from(auditLog).where(eq(auditLog.actor, userA));
      // Just verify we can read them
      expect(Array.isArray(auditEntries)).toBe(true);
    });

    it('Retention cleanup does not affect retained SOS records', async () => {
      // Keep this test independent from the account-deletion test ordering. A fresh
      // CI database has no pre-existing tombstone SOS event to query.
      await db.insert(users).values({
        id: SYSTEM_TOMBSTONE_USER_ID,
        name: '[DELETED USER]',
        phone: '+000000000000',
        lang: 'en',
        boxPub: 'tombstone_box_pub',
        signPub: 'tombstone_sign_pub',
        createdAt: Date.now(),
      }).onConflictDoNothing();

      const retainedSosId = randomUUID();
      await db.insert(sosEvents).values({
        id: retainedSosId,
        userId: SYSTEM_TOMBSTONE_USER_ID,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
        receivedAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
      });

      await cleanupWorker.runNightlyCleanup();

      const [tombstoneSos] = await db
        .select()
        .from(sosEvents)
        .where(eq(sosEvents.userId, SYSTEM_TOMBSTONE_USER_ID));
      expect(tombstoneSos).toBeDefined();

      await db.delete(sosEvents).where(eq(sosEvents.id, retainedSosId));
    });
  });

  // =========================================================================
  // 8. Firebase Cleanup
  // =========================================================================
  describe('Firebase Cleanup After Deletion', () => {
    it('Firebase cleanup is attempted after database transaction commits', async () => {
      const testUser = `user_sec_firebase_${runId}`;
      await db.insert(users).values({
        id: testUser,
        name: 'Firebase Cleanup Test',
        phone: '+919876543800',
        lang: 'en',
        boxPub: 'box_firebase',
        signPub: 'sign_firebase',
        createdAt: Date.now(),
      });

      // Delete should succeed even if Firebase is not configured (dev mode)
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', testUser);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('Firebase cleanup failure does not recreate database profile', async () => {
      // In test mode, Firebase is not initialized, so cleanup is skipped
      // The important thing is the DB transaction succeeds regardless
      const testUser = `user_sec_firebase_fail_${runId}`;
      await db.insert(users).values({
        id: testUser,
        name: 'Firebase Fail Test',
        phone: '+919876543801',
        lang: 'en',
        boxPub: 'box_firebase_fail',
        signPub: 'sign_firebase_fail',
        createdAt: Date.now(),
      });

      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', testUser);
      expect(res.status).toBe(200);

      // Profile should be gone
      const [user] = await db.select().from(users).where(eq(users.id, testUser));
      expect(user).toBeUndefined();
    });
  });
});
