import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  db,
  users,
  guardians,
  auditLog,
  SYSTEM_TOMBSTONE_USER_ID,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
} from '@workspace/db';
import { eq, and, sql } from 'drizzle-orm';
import { seed } from '../../../lib/db/src/seed.js';
import { deriveUserLockKey, userAdvisoryLockSql } from '../src/lib/lock.js';

describe('Implementation A: Tombstone Infrastructure & Resurrection Prevention', () => {
  const runId = Date.now();
  const testResurrectionUser = `user_test_resurrection_${runId}`;
  const testNormalUser = `user_test_normal_${runId}`;

  beforeAll(async () => {
    // Clean up test user fixtures
    await db.delete(users).where(eq(users.id, testResurrectionUser));
    await db.delete(users).where(eq(users.id, testNormalUser));
  });

  afterAll(async () => {
    // Cleanup fixtures
    await db.delete(users).where(eq(users.id, testResurrectionUser));
    await db.delete(users).where(eq(users.id, testNormalUser));
  });

  // 1. Tombstone seed can run twice without duplicate records
  // 2. Existing tombstone records are not overwritten
  it('1 & 2. Seed idempotency: seed can run multiple times without duplicating or overwriting tombstones', async () => {
    // Run seed twice
    await seed();
    await seed();

    // Verify exactly one tombstone user exists
    const tombstoneUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, SYSTEM_TOMBSTONE_USER_ID));

    expect(tombstoneUsers).toHaveLength(1);
    expect(tombstoneUsers[0].name).toBe('[DELETED USER]');
    expect(tombstoneUsers[0].phone).toBe('+000000000000');
    expect(tombstoneUsers[0].lang).toBe('en');
    expect(tombstoneUsers[0].createdAt).toBe(0);

    // Verify exactly one tombstone guardian exists
    const tombstoneGuardians = await db
      .select()
      .from(guardians)
      .where(eq(guardians.id, SYSTEM_TOMBSTONE_GUARDIAN_ID));

    expect(tombstoneGuardians).toHaveLength(1);
    expect(tombstoneGuardians[0].userId).toBe(SYSTEM_TOMBSTONE_USER_ID);
    expect(tombstoneGuardians[0].name).toBe('[DELETED GUARDIAN]');
    expect(tombstoneGuardians[0].consentStatus).toBe('revoked');
    expect(tombstoneGuardians[0].createdAt).toBe(0);
  });

  // 3. Normal users cannot create the nil UUID guardian
  it('3. Nil UUID guardian cannot be created as an ordinary guardian (PK uniqueness)', async () => {
    // Attempting to insert another guardian with the Nil UUID must be rejected by PostgreSQL PK constraint
    let threwError = false;
    try {
      await db.insert(guardians).values({
        id: SYSTEM_TOMBSTONE_GUARDIAN_ID,
        userId: 'user_dev_priya',
        name: 'Attacker Imposter',
        phoneE164: '+919999999999',
        relationship: 'imposter',
        channels: ['sms'],
        consentStatus: 'granted',
        createdAt: Date.now(),
      });
    } catch (err: any) {
      threwError = true;
      expect(err.message).toContain('duplicate key value');
    }
    expect(threwError).toBe(true);
  });

  // 4. Normal guardian listing does not expose the tombstone
  it('4. Normal guardian listing queries strictly exclude tombstone records', async () => {
    // A regular user querying their guardians receives only their guardians, never the tombstone
    const priyaGuardians = await db
      .select()
      .from(guardians)
      .where(eq(guardians.userId, 'user_dev_priya'));

    expect(priyaGuardians.length).toBeGreaterThan(0);
    const hasTombstone = priyaGuardians.some((g) => g.id === SYSTEM_TOMBSTONE_GUARDIAN_ID);
    expect(hasTombstone).toBe(false);
  });

  // 5. Deleted account audit marker blocks profile recreation
  it('5. Deleted account audit marker (user.delete) blocks profile recreation with 403 ACCOUNT_DELETED', async () => {
    // Step A: Create active profile for test user
    const createRes = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testResurrectionUser)
      .send({
        name: 'Soon To Be Deleted',
        phone: '+919876543201',
        lang: 'en',
        boxPub: 'sample_box_pub',
        signPub: 'sample_sign_pub',
      });
    expect(createRes.status).toBe(200);

    // Step B: Simulate account deletion by recording the immutable audit log entry and removing user row
    await db.transaction(async (tx) => {
      await tx.insert(auditLog).values({
        actor: testResurrectionUser,
        action: 'user.delete',
        resource: 'users',
        ts: Date.now(),
      });
      await tx.delete(users).where(eq(users.id, testResurrectionUser));
    });

    // Step C: Attempt profile recreation via PUT /me with valid auth credentials
    const resurrectionRes = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testResurrectionUser)
      .send({
        name: 'Resurrected User',
        phone: '+919876543201',
        lang: 'en',
        boxPub: 'new_box_pub',
        signPub: 'new_sign_pub',
      });

    // Must be rejected with 403 ACCOUNT_DELETED
    expect(resurrectionRes.status).toBe(403);
    expect(resurrectionRes.body.error).toBeDefined();
    expect(resurrectionRes.body.error.code).toBe('ACCOUNT_DELETED');

    // Verify row was NOT recreated in PostgreSQL
    const [persisted] = await db
      .select()
      .from(users)
      .where(eq(users.id, testResurrectionUser));
    expect(persisted).toBeUndefined();
  });

  // 6. Ordinary users can still create and update profiles
  // 9. Existing /me behavior remains unchanged for non-deleted users
  it('6 & 9. Ordinary users can create and update profiles without interference', async () => {
    // Initial creation
    const createRes = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testNormalUser)
      .send({
        name: 'Active User',
        phone: '+919876543202',
        lang: 'en',
        boxPub: 'normal_box_pub',
        signPub: 'normal_sign_pub',
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body.id).toBe(testNormalUser);
    expect(createRes.body.name).toBe('Active User');

    // Update
    const updateRes = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', testNormalUser)
      .send({
        name: 'Active User Updated',
        phone: '+919876543202',
        lang: 'hi',
        boxPub: 'normal_box_pub',
        signPub: 'normal_sign_pub',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Active User Updated');
    expect(updateRes.body.lang).toBe('hi');
  });

  // 7. Concurrent profile creation and deletion lock behavior
  it('7. Transaction-scoped advisory lock serializes concurrent transactions for same user', async () => {
    const lockUser = 'user_test_concurrency_lock_01';
    const lockKey = deriveUserLockKey(lockUser);

    // Verify deriveUserLockKey is deterministic
    expect(deriveUserLockKey(lockUser)).toBe(lockKey);
    expect(typeof lockKey).toBe('bigint');

    // Use two separate pool connections to verify cross-transaction lock mutual exclusion
    const { pool } = await import('@workspace/db');
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      // Transaction A begins and acquires advisory lock for the user
      await clientA.query('BEGIN');
      await clientA.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      // Transaction B attempts to acquire the same advisory lock in a transaction
      await clientB.query('BEGIN');
      const tryResA = await clientB.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [lockKey]);
      // Client B MUST NOT acquire the lock because Client A currently holds it
      expect(tryResA.rows[0].acquired).toBe(false);

      // Client A commits, releasing the transaction-scoped advisory lock
      await clientA.query('COMMIT');

      // Client B now attempts to acquire the lock and succeeds
      const tryResB = await clientB.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [lockKey]);
      expect(tryResB.rows[0].acquired).toBe(true);
      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  // 8. Firebase and development authentication reject system identities
  it('8a. Development auth bypass rejects system identities with 403 FORBIDDEN', async () => {
    // Attempting to bypass auth as system_tombstone_user
    const resTombstone = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', SYSTEM_TOMBSTONE_USER_ID);

    expect(resTombstone.status).toBe(403);
    expect(resTombstone.body.error.code).toBe('FORBIDDEN');

    // Attempting to bypass auth as arbitrary system_* identity
    const resSystem = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', 'system_admin_override');

    expect(resSystem.status).toBe(403);
    expect(resSystem.body.error.code).toBe('FORBIDDEN');
  });

  it('8b. Service-level checks reject direct calls with system identities', async () => {
    const res = await request(app)
      .put('/api/v1/me')
      .set('x-dev-user-id', 'system_fake_user')
      .send({
        name: 'Fake System',
        phone: '+919999999999',
        lang: 'en',
        boxPub: 'box',
        signPub: 'sign',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
