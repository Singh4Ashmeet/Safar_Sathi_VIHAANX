import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
  SYSTEM_TOMBSTONE_USER_ID,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { guardiansService } from '../src/modules/guardians/service.js';
import { notifyService } from '../src/modules/notify/index.js';

describe('Step 2.3: Guardian Management APIs (/guardians)', () => {
  const runId = Date.now();
  const userA = `user_guardians_alice_${runId}`;
  const userB = `user_guardians_bob_${runId}`;
  const userEmpty = `user_guardians_empty_${runId}`;
  const userConcurrency = `user_guardians_concur_${runId}`;

  beforeAll(async () => {
    // 1. Setup active profiles in real PostgreSQL for test users
    await db.insert(users).values([
      {
        id: userA,
        name: 'Alice Guardian Tester',
        phone: '+919876543001',
        lang: 'en',
        boxPub: 'box_pub_alice',
        signPub: 'sign_pub_alice',
        createdAt: Date.now(),
      },
      {
        id: userB,
        name: 'Bob Guardian Tester',
        phone: '+919876543002',
        lang: 'en',
        boxPub: 'box_pub_bob',
        signPub: 'sign_pub_bob',
        createdAt: Date.now(),
      },
      {
        id: userEmpty,
        name: 'Empty Guardian User',
        phone: '+919876543003',
        lang: 'en',
        boxPub: 'box_pub_empty',
        signPub: 'sign_pub_empty',
        createdAt: Date.now(),
      },
      {
        id: userConcurrency,
        name: 'Concurrency Tester',
        phone: '+919876543004',
        lang: 'en',
        boxPub: 'box_pub_concur',
        signPub: 'sign_pub_concur',
        createdAt: Date.now(),
      },
    ]).onConflictDoNothing();
  });

  afterAll(async () => {
    // Cleanup fixtures
    await db.delete(users).where(eq(users.id, userA));
    await db.delete(users).where(eq(users.id, userB));
    await db.delete(users).where(eq(users.id, userEmpty));
    await db.delete(users).where(eq(users.id, userConcurrency));
  });

  // =========================================================================
  // 1 & 2. Guardian Listing (Empty and Populated)
  // =========================================================================
  describe('Listing Guardians (GET /api/v1/guardians)', () => {
    it('2. Empty guardian list returns 200 []', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userEmpty);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    let createdGuardianId: string;

    it('4. Successful guardian creation via POST /api/v1/guardians', async () => {
      const payload = {
        name: 'Papa Sharma',
        phoneE164: '+919876543111',
        email: 'papa.sharma@example.com',
        relationship: 'father',
        channels: ['sms', 'telegram'],
      };

      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.guardian).toBeDefined();
      expect(res.body.guardian.name).toBe('Papa Sharma');
      expect(res.body.guardian.phoneE164).toBe('+919876543111');
      expect(res.body.guardian.email).toBe('papa.sharma@example.com');
      expect(res.body.guardian.relationship).toBe('father');
      expect(res.body.guardian.channels).toEqual(['sms', 'telegram']);
      expect(res.body.guardian.consentStatus).toBe('pending');
      expect(typeof res.body.guardian.createdAt).toBe('number');
      expect(res.body.telegramDeepLink).toContain('https://t.me/');
      expect(res.body.telegramDeepLink).toContain(res.body.guardian.id);

      createdGuardianId = res.body.guardian.id;
    });

    it('1. Authenticated guardian listing returns created guardians', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(createdGuardianId);
      expect(res.body[0].name).toBe('Papa Sharma');
      expect(res.body[0].consentStatus).toBe('pending');
    });

    it('3. Cross-user listing isolation: User B cannot see User A guardians', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userB);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. Validation and Constraint Enforcement
  // =========================================================================
  describe('Validation & Constraints (POST /api/v1/guardians)', () => {
    it('5. Missing and malformed required fields reject with 400 VALIDATION_ERROR', async () => {
      // Missing name
      const res1 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: '',
          phoneE164: '+919876543222',
          relationship: 'friend',
          channels: ['sms'],
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      // Invalid phone format (not E.164)
      const res2 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Friend',
          phoneE164: '9876543222', // Missing leading '+'
          relationship: 'friend',
          channels: ['sms'],
        });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');

      // Empty channels array
      const res3 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Friend',
          phoneE164: '+919876543222',
          relationship: 'friend',
          channels: [],
        });
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('VALIDATION_ERROR');

      // Invalid channel enum
      const res4 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Friend',
          phoneE164: '+919876543222',
          relationship: 'friend',
          channels: ['whatsapp'],
        });
      expect(res4.status).toBe(400);
      expect(res4.body.error.code).toBe('VALIDATION_ERROR');

      // Malformed email
      const res5 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Friend',
          phoneE164: '+919876543222',
          relationship: 'friend',
          channels: ['sms'],
          email: 'not-an-email',
        });
      expect(res5.status).toBe(400);
      expect(res5.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('6. Duplicate phone number rejection for the same user', async () => {
      // Attempt to add another guardian with Papa Sharma's phone (+919876543111)
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Duplicate Papa',
          phoneE164: '+919876543111',
          relationship: 'guardian',
          channels: ['sms'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_GUARDIAN_PHONE');
    });

    it('7. Maximum five guardians enforcement', async () => {
      // userA currently has 1 guardian (+919876543111). Add 4 more to reach the limit of 5.
      const phones = [
        '+919876543112',
        '+919876543113',
        '+919876543114',
        '+919876543115',
      ];

      for (const phone of phones) {
        const res = await request(app)
          .post('/api/v1/guardians')
          .set('x-dev-user-id', userA)
          .send({
            name: `Guardian ${phone}`,
            phoneE164: phone,
            relationship: 'friend',
            channels: ['sms'],
          });
        expect(res.status).toBe(201);
      }

      // Verify exactly 5 exist
      const listRes = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);
      expect(listRes.body).toHaveLength(5);

      // Attempt to add a 6th guardian
      const res6 = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userA)
        .send({
          name: 'Sixth Guardian Over Limit',
          phoneE164: '+919876543116',
          relationship: 'colleague',
          channels: ['sms'],
        });

      expect(res6.status).toBe(400);
      expect(res6.body.error.code).toBe('GUARDIAN_LIMIT_EXCEEDED');
    });

    it('8. Real PostgreSQL Concurrency: Parallel creation attempts exceeding limit are serialized', async () => {
      // userConcurrency currently has 0 guardians.
      // Fire 7 concurrent guardian additions with distinct phone numbers.
      const attempts = Array.from({ length: 7 }, (_, i) => ({
        name: `Concur Guardian ${i}`,
        phoneE164: `+91987655500${i}`,
        relationship: 'sibling',
        channels: ['sms'],
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

      // Exactly 5 must succeed, and exactly 2 must be rejected with GUARDIAN_LIMIT_EXCEEDED
      expect(successful).toHaveLength(5);
      expect(rejected).toHaveLength(2);

      // Confirm DB holds exactly 5 guardians
      const finalGuardians = await db
        .select()
        .from(guardians)
        .where(eq(guardians.userId, userConcurrency));
      expect(finalGuardians).toHaveLength(5);
    });
  });

  // =========================================================================
  // 4. Consent and Tracking Access Safety
  // =========================================================================
  describe('Consent & Live Tracking Safety Rules', () => {
    it('9. Guardian creation always starts as pending', async () => {
      const res = await request(app)
        .post('/api/v1/guardians')
        .set('x-dev-user-id', userB)
        .send({
          name: 'Consent Safety Guardian',
          phoneE164: '+919876543999',
          relationship: 'partner',
          channels: ['sms'],
        });

      expect(res.status).toBe(201);
      expect(res.body.guardian.consentStatus).toBe('pending');

      const [stored] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.id, res.body.guardian.id));
      expect(stored.consentStatus).toBe('pending');
    });

    it('10. Invitation creation does not grant consent', async () => {
      // Listing the guardian confirms consentStatus is still pending after creation and invite
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userB);

      const target = res.body.find((g: any) => g.phoneE164 === '+919876543999');
      expect(target).toBeDefined();
      expect(target.consentStatus).toBe('pending');
    });

    it('11. Pending guardian cannot access live location (assertLiveLocationAccess throws 403)', async () => {
      const [pendingGuardian] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.userId, userB));

      expect(pendingGuardian.consentStatus).toBe('pending');

      await expect(
        guardiansService.assertLiveLocationAccess(pendingGuardian.id)
      ).rejects.toThrowError(/Guardian does not have granted consent/);
    });

    it('12. Revoked guardian cannot access live location', async () => {
      const revokedId = `12121212-1212-4212-8212-${String(runId).slice(-12)}`;
      await db.insert(guardians).values({
        id: revokedId,
        userId: userB,
        name: 'Revoked Guardian',
        phoneE164: '+919876543888',
        relationship: 'ex',
        channels: ['sms'],
        consentStatus: 'revoked',
        createdAt: Date.now(),
      });

      await expect(
        guardiansService.assertLiveLocationAccess(revokedId)
      ).rejects.toThrowError(/Guardian does not have granted consent/);

      await db.delete(guardians).where(eq(guardians.id, revokedId));
    });
  });

  // =========================================================================
  // 5. Deletion, IDOR, Share-Link Revocation & SOS Preservation
  // =========================================================================
  describe('Guardian Deletion (DELETE /api/v1/guardians/:id)', () => {
    let guardianToDeleteId: string;
    let bobGuardianId: string;
    const shareLinkId = `aaaa1111-2222-4333-8444-${String(runId).slice(-12)}`;
    const sosEventId = `bbbb1111-2222-4333-8444-${String(runId).slice(-12)}`;
    const deliveryId = `cccc1111-2222-4333-8444-${String(runId).slice(-12)}`;
    const ackId = `dddd1111-2222-4333-8444-${String(runId).slice(-12)}`;

    beforeAll(async () => {
      // Pick one guardian from userA to delete
      const listA = await guardiansService.listGuardians(userA);
      guardianToDeleteId = listA[0].id;

      // Pick one guardian from userB to test IDOR
      const listB = await guardiansService.listGuardians(userB);
      bobGuardianId = listB[0].id;

      // Create an active share link pointing to guardianToDeleteId
      await db.insert(sosEvents).values({
        id: sosEventId,
        userId: userA,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      await db.insert(shareLinks).values({
        id: shareLinkId,
        tokenHash: `hash_guardian_sl_${runId}`,
        sosId: sosEventId,
        guardianId: guardianToDeleteId,
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      });

      // Create SOS delivery to guardianToDeleteId
      await db.insert(sosDeliveries).values({
        id: deliveryId,
        sosId: sosEventId,
        guardianId: guardianToDeleteId,
        channel: 'sms',
        status: 'sent',
        updatedAt: Date.now(),
      });

      // Create SOS ack by guardianToDeleteId
      await db.insert(sosAcks).values({
        id: ackId,
        sosId: sosEventId,
        guardianId: guardianToDeleteId,
        ackAt: Date.now(),
      });
    });

    afterAll(async () => {
      await db.delete(sosEvents).where(eq(sosEvents.id, sosEventId));
    });

    it('15. Invalid guardian UUID returns 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .delete('/api/v1/guardians/not-a-valid-uuid')
        .set('x-dev-user-id', userA);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('14. Cross-user deletion rejection: User A cannot delete User B guardian', async () => {
      const res = await request(app)
        .delete(`/api/v1/guardians/${bobGuardianId}`)
        .set('x-dev-user-id', userA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('GUARDIAN_NOT_FOUND');

      // Bob's guardian must still exist
      const [bobG] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.id, bobGuardianId));
      expect(bobG).toBeDefined();
    });

    it('13. Successful owner-authorized deletion returns 200 { ok: true }', async () => {
      const res = await request(app)
        .delete(`/api/v1/guardians/${guardianToDeleteId}`)
        .set('x-dev-user-id', userA);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Verify row removed from guardians table
      const [deletedRow] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.id, guardianToDeleteId));
      expect(deletedRow).toBeUndefined();
    });

    it('16. Associated share-links are revoked upon guardian deletion', async () => {
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.id, shareLinkId));

      expect(link).toBeUndefined();
    });

    it('17. SOS records, deliveries, and acknowledgements remain intact under tombstone guardian', async () => {
      // SOS Event is preserved
      const [sos] = await db
        .select()
        .from(sosEvents)
        .where(eq(sosEvents.id, sosEventId));
      expect(sos).toBeDefined();

      // SOS delivery was reassigned to system tombstone guardian
      const [delivery] = await db
        .select()
        .from(sosDeliveries)
        .where(eq(sosDeliveries.id, deliveryId));
      expect(delivery).toBeDefined();
      expect(delivery.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);

      // SOS ack was reassigned to system tombstone guardian
      const [ack] = await db
        .select()
        .from(sosAcks)
        .where(eq(sosAcks.id, ackId));
      expect(ack).toBeDefined();
      expect(ack.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);
    });
  });

  // =========================================================================
  // 6. Tombstone Protection & Privacy Redaction
  // =========================================================================
  describe('Tombstone Protection & Privacy (Scenarios 18 & 19)', () => {
    it('18a. Tombstone guardian cannot be listed in GET /guardians', async () => {
      // Even if querying directly or as an admin, tombstone is filtered out
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', userA);

      const hasTombstone = res.body.some((g: any) => g.id === SYSTEM_TOMBSTONE_GUARDIAN_ID);
      expect(hasTombstone).toBe(false);
    });

    it('18b. Tombstone guardian cannot be deleted via DELETE /guardians/:id', async () => {
      const res = await request(app)
        .delete(`/api/v1/guardians/${SYSTEM_TOMBSTONE_GUARDIAN_ID}`)
        .set('x-dev-user-id', userA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('GUARDIAN_NOT_FOUND');

      // Tombstone guardian record in DB must remain intact
      const [tombstone] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.id, SYSTEM_TOMBSTONE_GUARDIAN_ID));
      expect(tombstone).toBeDefined();
      expect(tombstone.name).toBe('[DELETED GUARDIAN]');
    });

    it('18c. Tombstone guardian is skipped in notification dispatch (notifyService.dispatchAlert)', async () => {
      const deliveryResults = await notifyService.dispatchAlert(
        'mock-sos-alert-id',
        [
          {
            guardianId: SYSTEM_TOMBSTONE_GUARDIAN_ID,
            name: '[DELETED GUARDIAN]',
            phoneE164: '+000000000000',
            channels: ['sms', 'telegram', 'email'],
          },
        ],
        {
          userName: 'Test User',
          trackingUrl: 'http://localhost/t/mock',
        }
      );

      // Must be empty: tombstone guardian was skipped and never notified
      expect(deliveryResults).toHaveLength(0);
    });

    it('19. Sensitive guardian details are not leaked through error responses', async () => {
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
  });
});

