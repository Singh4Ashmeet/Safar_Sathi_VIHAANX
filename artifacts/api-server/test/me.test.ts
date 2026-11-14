import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db, users, sosEvents, auditLog } from '@workspace/db';
import { eq } from 'drizzle-orm';

describe('FR-01 & FR-14: User Profile APIs (/me)', () => {
  const runId = Date.now();
  const testUserA = `user_test_alice_${runId}`;
  const testUserB = `user_test_bob_${runId}`;
  const testUserSpoof = `user_test_spoof_${runId}`;
  const testUserWithSos = `user_test_charlie_${runId}`;
  const testNonExistentUser = `user_test_nonexistent_${runId}`;
  const testUserToDelete = `user_test_delete_${runId}`;

  beforeAll(async () => {
    // Ensure clean fixture state
    await db.delete(users).where(eq(users.id, testUserA));
    await db.delete(users).where(eq(users.id, testUserB));
    await db.delete(users).where(eq(users.id, testUserSpoof));
    await db.delete(users).where(eq(users.id, testUserWithSos));
    await db.delete(users).where(eq(users.id, testNonExistentUser));
    await db.delete(users).where(eq(users.id, testUserToDelete));
  });

  afterAll(async () => {
    // Cleanup fixtures
    await db.delete(users).where(eq(users.id, testUserA));
    await db.delete(users).where(eq(users.id, testUserB));
    await db.delete(users).where(eq(users.id, testUserSpoof));
    await db.delete(users).where(eq(users.id, testUserWithSos));
    await db.delete(users).where(eq(users.id, testUserToDelete));
  });

  // 1. Unauthenticated GET returns 401
  it('1. Unauthenticated GET /api/v1/me returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 3. Missing profile returns 404
  it('3. Authenticated GET /api/v1/me for non-existent profile returns 404 USER_NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', testNonExistentUser);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  // 4. PUT creates a profile
  let originalCreatedAt: number;
  it('4. PUT /api/v1/me creates a new profile', async () => {
    const payload = {
      name: 'Alice Sharma',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'MCowBQYDK2VuAyEAalice_curve25519_box_pub_key_base64_encoded',
      signPub: 'MCowBQYDK2VwAyEAalice_ed25519_sign_pub_key_base64_encoded',
      expoPushToken: 'ExponentPushToken[alice_dummy_push_token]',
      adultConfirmedAt: Date.now() - 100000,
    };

    const res = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserA)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testUserA);
    expect(res.body.name).toBe('Alice Sharma');
    expect(res.body.phone).toBe('+919876543210');
    expect(res.body.lang).toBe('en');
    expect(res.body.boxPub).toBe(payload.boxPub);
    expect(res.body.signPub).toBe(payload.signPub);
    expect(res.body.expoPushToken).toBe(payload.expoPushToken);
    expect(res.body.adultConfirmedAt).toBe(payload.adultConfirmedAt);
    expect(typeof res.body.createdAt).toBe('number');
    originalCreatedAt = res.body.createdAt;
  });

  // 2. Authenticated GET returns the correct user's profile
  it('2. Authenticated GET /api/v1/me returns the correct user profile', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', testUserA);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testUserA);
    expect(res.body.name).toBe('Alice Sharma');
    expect(res.body.phone).toBe('+919876543210');
    expect(res.body.createdAt).toBe(originalCreatedAt);
  });

  // 5. PUT updates an existing profile
  // 6. createdAt remains unchanged after update
  it('5 & 6. PUT /api/v1/me updates an existing profile while preserving createdAt', async () => {
    // Wait briefly so timestamps would differ if re-generated
    await new Promise((r) => setTimeout(r, 50));

    const updatePayload = {
      name: 'Alice S. Verma',
      phone: '+919876543219',
      lang: 'hi',
      boxPub: 'MCowBQYDK2VuAyEAalice_updated_box_pub',
      signPub: 'MCowBQYDK2VwAyEAalice_updated_sign_pub',
      // omitting expoPushToken and adultConfirmedAt to verify optional fields are not overwritten
    };

    const res = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserA)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice S. Verma');
    expect(res.body.phone).toBe('+919876543219');
    expect(res.body.lang).toBe('hi');
    expect(res.body.boxPub).toBe('MCowBQYDK2VuAyEAalice_updated_box_pub');
    // Preservation of createdAt
    expect(res.body.createdAt).toBe(originalCreatedAt);
    // Preservation of omitted optional field
    expect(res.body.expoPushToken).toBe('ExponentPushToken[alice_dummy_push_token]');
  });

  // 7. Client-supplied UID cannot override Firebase UID
  it('7. Client-supplied UID in payload cannot override authenticated Firebase UID', async () => {
    const spoofPayload = {
      id: 'attacker_controlled_uid_999',
      name: 'Spoof Test User',
      phone: '+919876543299',
      lang: 'en',
      boxPub: 'box_key',
      signPub: 'sign_key',
    };

    const res = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserSpoof)
      .send(spoofPayload);

    expect(res.status).toBe(200);
    // The profile returned must strictly be testUserSpoof, not attacker_controlled_uid_999
    expect(res.body.id).toBe(testUserSpoof);
    expect(res.body.name).toBe('Spoof Test User');

    // Verify attacker UID was not created in DB
    const [attacker] = await db.select().from(users).where(eq(users.id, 'attacker_controlled_uid_999'));
    expect(attacker).toBeUndefined();
  });

  // 8. Invalid profile payload returns validation error
  it('8. Invalid profile payload (empty name or bad language) returns 400 VALIDATION_ERROR', async () => {
    const invalidPayload = {
      name: '', // Empty name violated min(1)
      phone: '+919876543210',
      lang: 'french', // Invalid enum
      boxPub: 'box_key',
      signPub: 'sign_key',
    };

    const res = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserA)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  // 9. User A cannot read User B's profile
  it('9. User A cannot read User B profile (complete user isolation)', async () => {
    // Create Bob's profile first
    await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserB)
      .send({
        name: 'Bob Singh',
        phone: '+919123456789',
        lang: 'en',
        boxPub: 'bob_box_pub',
        signPub: 'bob_sign_pub',
      });

    // Alice requests /me: receives only Alice's profile
    const aliceRes = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', testUserA);

    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.id).toBe(testUserA);
    expect(aliceRes.body.name).toBe('Alice S. Verma');

    // Bob requests /me: receives only Bob's profile
    const bobRes = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', testUserB);

    expect(bobRes.status).toBe(200);
    expect(bobRes.body.id).toBe(testUserB);
    expect(bobRes.body.name).toBe('Bob Singh');
  });

  // 10. DELETE follows documented response behaviour and tombstone preservation
  it('10a. DELETE /api/v1/me succeeds with 200 { ok: true } when user has SOS safety records, preserving them under tombstone', async () => {
    // Create Charlie with a profile
    await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserWithSos)
      .send({
        name: 'Charlie SOS',
        phone: '+919876500000',
        lang: 'en',
        boxPub: 'charlie_box_pub',
        signPub: 'charlie_sign_pub',
      });

    const testSosId = `00000000-0000-0000-0000-${String(runId).slice(-12)}`;

    // Insert an SOS event for Charlie
    await db.insert(sosEvents).values({
      id: testSosId,
      userId: testUserWithSos,
      trigger: 'button',
      duress: false,
      status: 'resolved',
      source: 'direct',
      createdAt: Date.now() - 100000,
      receivedAt: Date.now() - 100000,
    });

    // Attempt deletion
    const res = await request(app)
      .delete('/api/v1/me')
      .set('x-dev-user-id', testUserWithSos);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Verify user profile is deleted
    const [charlie] = await db.select().from(users).where(eq(users.id, testUserWithSos));
    expect(charlie).toBeUndefined();

    // Verify SOS event was preserved and reassigned to system tombstone user
    const [preservedSos] = await db.select().from(sosEvents).where(eq(sosEvents.id, testSosId));
    expect(preservedSos).toBeDefined();
    expect(preservedSos.userId).toBe('system_tombstone_user');

    // Clean up SOS event for fixture teardown
    await db.delete(sosEvents).where(eq(sosEvents.id, testSosId));
  });

  it('10b. DELETE /api/v1/me succeeds for user without retained SOS records, records audit log, and erases personal data', async () => {
    // Create profile for user to delete
    await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testUserToDelete)
      .send({
        name: 'Delete Me User',
        phone: '+919876543209',
        lang: 'en',
        boxPub: 'del_box_pub',
        signPub: 'del_sign_pub',
      });

    // Delete user's account (user has no SOS events)
    const res = await request(app)
      .delete('/api/v1/me')
      .set('x-dev-user-id', testUserToDelete);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Subsequent GET returns 404
    const getRes = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', testUserToDelete);
    expect(getRes.status).toBe(404);

    // Verify audit log has recorded the deletion
    const [auditEntry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actor, testUserToDelete));

    expect(auditEntry).toBeDefined();
    expect(auditEntry.action).toBe('user.delete');
    expect(auditEntry.resource).toBe('users');
  });
});
