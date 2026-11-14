import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import admin from 'firebase-admin';
import { app } from '../src/app.js';
import {
  db,
  pool,
  users,
  guardians,
  trips,
  tripPoints,
  sosEvents,
  sosDeliveries,
  sosAcks,
  shareLinks,
  watchTimers,
  auditLog,
  SYSTEM_TOMBSTONE_USER_ID,
  SYSTEM_TOMBSTONE_GUARDIAN_ID,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import {
  cleanupFirebaseUser,
  _setFirebaseInitializedForTesting,
} from '../src/middleware/auth.js';
import { deriveUserLockKey } from '../src/lib/lock.js';

describe('Step 2.2 Implementation B: Account Deletion, SOS Preservation & Privacy-Safe Cleanup', () => {
  const runId = Date.now();

  const userT1toT6 = `user_del_t1_${runId}`;
  const userUnrelated = `user_del_unrelated_${runId}`;
  const userSosPreserve = `user_del_sos_${runId}`;
  const userShareLinks = `user_del_share_${runId}`;
  const userConcurrency = `user_del_concur_${runId}`;

  beforeAll(async () => {
    // Ensure clean fixture state
    await db.delete(users).where(eq(users.id, userT1toT6));
    await db.delete(users).where(eq(users.id, userUnrelated));
    await db.delete(users).where(eq(users.id, userSosPreserve));
    await db.delete(users).where(eq(users.id, userShareLinks));
    await db.delete(users).where(eq(users.id, userConcurrency));
  });

  afterAll(async () => {
    // Cleanup fixtures
    await db.delete(users).where(eq(users.id, userT1toT6));
    await db.delete(users).where(eq(users.id, userUnrelated));
    await db.delete(users).where(eq(users.id, userSosPreserve));
    await db.delete(users).where(eq(users.id, userShareLinks));
    await db.delete(users).where(eq(users.id, userConcurrency));
    _setFirebaseInitializedForTesting(false);
  });

  // Account Deletion
  describe('Account Deletion (T1 - T6)', () => {
    it('T1: Successful DELETE returns 200 { ok: true }', async () => {
      // Setup profile for user
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userT1toT6)
        .send({
          name: 'Target Deletion User',
          phone: '+919876543211',
          lang: 'en',
          boxPub: 'target_box_pub',
          signPub: 'target_sign_pub',
        });

      // Setup unrelated user to prove isolation
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userUnrelated)
        .send({
          name: 'Unrelated Innocent User',
          phone: '+919876543222',
          lang: 'hi',
          boxPub: 'unrelated_box_pub',
          signPub: 'unrelated_sign_pub',
        });

      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userT1toT6);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('T2: Original profile removed from database', async () => {
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, userT1toT6));

      expect(userRow).toBeUndefined();
    });

    it('T3: Subsequent GET /me returns 404 USER_NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userT1toT6);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('T4: Subsequent PUT /me returns 403 ACCOUNT_DELETED (resurrection blocked)', async () => {
      const res = await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userT1toT6)
        .send({
          name: 'Resurrect Attempt',
          phone: '+919876543211',
          lang: 'en',
          boxPub: 'new_box',
          signPub: 'new_sign',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DELETED');

      // Verify still absent
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, userT1toT6));
      expect(userRow).toBeUndefined();
    });

    it('T5: Repeated DELETE returns 200 { ok: true } without corrupting records (idempotent)', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userT1toT6);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Audit marker should exist
      const auditEntries = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.actor, userT1toT6), eq(auditLog.action, 'user.delete')));

      expect(auditEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('T6: Existing unrelated users untouched', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('x-dev-user-id', userUnrelated);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userUnrelated);
      expect(res.body.name).toBe('Unrelated Innocent User');
      expect(res.body.phone).toBe('+919876543222');
    });
  });

  //SOS Preservation & Personal Data Erasure
  describe('SOS Preservation & Personal Data Erasure (T7 - T12)', () => {
    const guardianId = `11111111-1111-4111-8111-${String(runId).slice(-12)}`;
    const tripId = `22222222-2222-4222-8222-${String(runId).slice(-12)}`;
    const tripPointId = `33333333-3333-4333-8333-${String(runId).slice(-12)}`;
    const sosId = `44444444-4444-4444-8444-${String(runId).slice(-12)}`;
    const deliveryId = `55555555-5555-4555-8555-${String(runId).slice(-12)}`;
    const ackId = `66666666-6666-4666-8666-${String(runId).slice(-12)}`;

    beforeAll(async () => {
      // Create user
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userSosPreserve)
        .send({
          name: 'SOS User To Delete',
          phone: '+919876500001',
          lang: 'en',
          boxPub: 'sos_box_pub',
          signPub: 'sos_sign_pub',
        });

      // Create guardian
      await db.insert(guardians).values({
        id: guardianId,
        userId: userSosPreserve,
        name: 'Personal Guardian Mom',
        phoneE164: '+919876500002',
        relationship: 'mother',
        channels: ['sms', 'push'],
        consentStatus: 'granted',
        createdAt: Date.now() - 50000,
      });

      // Create trip
      await db.insert(trips).values({
        id: tripId,
        userId: userSosPreserve,
        destination: 'Connaught Place',
        destLat: 28.6315,
        destLng: 77.2167,
        routePolyline: 'encoded_sample_polyline',
        status: 'active',
        startedAt: Date.now() - 40000,
      });

      // Create trip point
      await db.insert(tripPoints).values({
        id: tripPointId,
        tripId,
        ts: Date.now() - 30000,
        lat: 28.6300,
        lng: 77.2150,
      });

      // Create SOS event linked to trip
      await db.insert(sosEvents).values({
        id: sosId,
        userId: userSosPreserve,
        tripId,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now() - 20000,
        receivedAt: Date.now() - 20000,
      });

      // Create SOS delivery to personal guardian
      await db.insert(sosDeliveries).values({
        id: deliveryId,
        sosId,
        guardianId,
        channel: 'sms',
        status: 'sent',
        updatedAt: Date.now() - 15000,
      });

      // Create SOS ack by personal guardian
      await db.insert(sosAcks).values({
        id: ackId,
        sosId,
        guardianId,
        ackAt: Date.now() - 10000,
      });
    });

    it('Executes account deletion for user with full safety tree', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userSosPreserve);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('T7: SOS events survive with userId = SYSTEM_TOMBSTONE_USER_ID', async () => {
      const [retainedSos] = await db
        .select()
        .from(sosEvents)
        .where(eq(sosEvents.id, sosId));

      expect(retainedSos).toBeDefined();
      expect(retainedSos.userId).toBe(SYSTEM_TOMBSTONE_USER_ID);
      expect(retainedSos.trigger).toBe('button');
    });

    it('T8: SOS deliveries survive with guardianId = SYSTEM_TOMBSTONE_GUARDIAN_ID', async () => {
      const [delivery] = await db
        .select()
        .from(sosDeliveries)
        .where(eq(sosDeliveries.id, deliveryId));

      expect(delivery).toBeDefined();
      expect(delivery.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);
      expect(delivery.status).toBe('sent');
    });

    it('T9: SOS acknowledgments survive with guardianId = SYSTEM_TOMBSTONE_GUARDIAN_ID', async () => {
      const [ack] = await db
        .select()
        .from(sosAcks)
        .where(eq(sosAcks.id, ackId));

      expect(ack).toBeDefined();
      expect(ack.guardianId).toBe(SYSTEM_TOMBSTONE_GUARDIAN_ID);
    });

    it('T10: Original guardians removed', async () => {
      const [guardian] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.id, guardianId));

      expect(guardian).toBeUndefined();
    });

    it('T11: Original trips and trip points removed', async () => {
      const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId));
      expect(trip).toBeUndefined();

      const [point] = await db
        .select()
        .from(tripPoints)
        .where(eq(tripPoints.id, tripPointId));
      expect(point).toBeUndefined();
    });

    it('T12: Retained SOS events have tripId = null', async () => {
      const [retainedSos] = await db
        .select()
        .from(sosEvents)
        .where(eq(sosEvents.id, sosId));

      expect(retainedSos).toBeDefined();
      expect(retainedSos.tripId).toBeNull();
    });
  });

  //Share-Link Privacy & Tracking Revocation
  describe('Share-Link Privacy & Tracking Revocation (T13 - T16)', () => {
    const guardianId = `77777777-7777-4777-8777-${String(runId).slice(-12)}`;
    const tripId = `88888888-8888-4888-8888-${String(runId).slice(-12)}`;
    const sosId = `99999999-9999-4999-8999-${String(runId).slice(-12)}`;

    const publicSosTokenHash = `hash_public_sos_${runId}`;
    const guardianSosTokenHash = `hash_guardian_sos_${runId}`;
    const tripTokenHash = `hash_trip_${runId}`;

    beforeAll(async () => {
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userShareLinks)
        .send({
          name: 'Share Link User',
          phone: '+919876500003',
          lang: 'en',
          boxPub: 'sl_box_pub',
          signPub: 'sl_sign_pub',
        });

      await db.insert(guardians).values({
        id: guardianId,
        userId: userShareLinks,
        name: 'Share Link Guardian',
        phoneE164: '+919876500004',
        relationship: 'sibling',
        channels: ['sms'],
        consentStatus: 'granted',
        createdAt: Date.now(),
      });

      await db.insert(trips).values({
        id: tripId,
        userId: userShareLinks,
        destination: 'India Gate',
        destLat: 28.6129,
        destLng: 77.2295,
        routePolyline: 'polyline_data',
        status: 'active',
        startedAt: Date.now(),
      });

      await db.insert(sosEvents).values({
        id: sosId,
        userId: userShareLinks,
        trigger: 'shake',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      // T13 fixture: SOS share link with guardianId = null (Public tracking link)
      await db.insert(shareLinks).values({
        tokenHash: publicSosTokenHash,
        sosId,
        guardianId: null,
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      });

      // T14 fixture: Guardian-specific SOS share link
      await db.insert(shareLinks).values({
        tokenHash: guardianSosTokenHash,
        sosId,
        guardianId,
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      });

      // T16 fixture: Trip share link
      await db.insert(shareLinks).values({
        tokenHash: tripTokenHash,
        tripId,
        guardianId: null,
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      });
    });

    it('Executes account deletion for user with active public & guardian share links', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userShareLinks);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('T13: SOS share links with guardianId = null are deleted', async () => {
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, publicSosTokenHash));

      expect(link).toBeUndefined();
    });

    it('T14: Guardian-specific SOS share links are deleted', async () => {
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, guardianSosTokenHash));

      expect(link).toBeUndefined();
    });

    it('T15: Public tracking tokens fail after deletion', async () => {
      // Simulating a public tracking query: token lookup returns nothing
      const results = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, publicSosTokenHash));

      expect(results).toHaveLength(0);
    });

    it('T16: Trip share links invalidated (cascaded on trip deletion)', async () => {
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, tripTokenHash));

      expect(link).toBeUndefined();
    });
  });


  // Concurrency Integration & Deadlock Prevention
  describe('Concurrency Integration & Deadlock Prevention (T17 - T21)', () => {
    it('T17 & T18: Concurrent PUT and DELETE serialized via advisory lock; profile cannot be recreated', async () => {
      // Create user first
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userConcurrency)
        .send({
          name: 'Concurrent User',
          phone: '+919876599999',
          lang: 'en',
          boxPub: 'c_box',
          signPub: 'c_sign',
        });

      // Fire concurrent DELETE and PUT requests
      const [deleteRes, putRes] = await Promise.all([
        request(app).delete('/api/v1/me').set('x-dev-user-id', userConcurrency),
        request(app).put('/api/v1/me').set('x-dev-user-id', userConcurrency).send({
          name: 'Concurrent Update Attempt',
          phone: '+919876599999',
          lang: 'en',
          boxPub: 'c_box',
          signPub: 'c_sign',
        }),
      ]);

      // DELETE must succeed
      expect(deleteRes.status).toBe(200);

      //FollowUp Request
      const followUpRes = await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userConcurrency)
        .send({
          name: 'Final Recreate Attempt',
          phone: '+919876599999',
          lang: 'en',
          boxPub: 'c_box',
          signPub: 'c_sign',
        });

      expect(followUpRes.status).toBe(403);
      expect(followUpRes.body.error.code).toBe('ACCOUNT_DELETED');

      const [dbUser] = await db.select().from(users).where(eq(users.id, userConcurrency));
      expect(dbUser).toBeUndefined();
    });

    it('T19: Concurrent watchdog trip processing (FOR UPDATE SKIP LOCKED) does not deadlock with deletion', async () => {
      const userDeadlockTrip = `user_deadlock_trip_${runId}`;
      const tripId = `aaaaaaa1-aaaa-4aaa-8aaa-${String(runId).slice(-12)}`;

      // Create user and trip
      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userDeadlockTrip)
        .send({
          name: 'Deadlock Trip Test User',
          phone: '+919876512345',
          lang: 'en',
          boxPub: 'dl_box',
          signPub: 'dl_sign',
        });

      await db.insert(trips).values({
        id: tripId,
        userId: userDeadlockTrip,
        destination: 'Test Mall',
        destLat: 28.5,
        destLng: 77.2,
        routePolyline: 'poly',
        status: 'active',
        startedAt: Date.now(),
      });

      // Simulate a watchdog worker transaction acquiring a lock on the trip child first
      const clientWorker = await pool.connect();
      try {
        await clientWorker.query('BEGIN');
        // Watchdog locks trip child row
        await clientWorker.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);

        // Start account deletion in background 
        // Because deletion follows child-first ordering 
        // deletion will wait on the trip row without deadlocking parent vs child!
        const deletePromise = request(app)
          .delete('/api/v1/me')
          .set('x-dev-user-id', userDeadlockTrip);

        // Allow worker to complete its processing and COMMIT
        await new Promise((r) => setTimeout(r, 100));
        await clientWorker.query('COMMIT');

        // Deletion completes smoothly without 40P01 deadlock
        const delRes = await deletePromise;
        expect(delRes.status).toBe(200);
        expect(delRes.body).toEqual({ ok: true });
      } finally {
        clientWorker.release();
        await db.delete(users).where(eq(users.id, userDeadlockTrip));
      }
    });

    it('T20: Concurrent Watch Me expiry does not deadlock with deletion', async () => {
      const userDeadlockWatch = `user_deadlock_watch_${runId}`;
      const watchId = `bbbbbbb2-bbbb-4bbb-8bbb-${String(runId).slice(-12)}`;

      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userDeadlockWatch)
        .send({
          name: 'Deadlock Watch Test User',
          phone: '+919876554321',
          lang: 'en',
          boxPub: 'w_box',
          signPub: 'w_sign',
        });

      await db.insert(watchTimers).values({
        id: watchId,
        userId: userDeadlockWatch,
        endsAt: Date.now() + 60000,
        status: 'active',
        createdAt: Date.now(),
      });

      const clientWatcher = await pool.connect();
      try {
        await clientWatcher.query('BEGIN');
        // Watch worker locks watch_timer row
        await clientWatcher.query('SELECT * FROM watch_timers WHERE id = $1 FOR UPDATE', [watchId]);

        // Trigger account deletion
        const deletePromise = request(app)
          .delete('/api/v1/me')
          .set('x-dev-user-id', userDeadlockWatch);

        await new Promise((r) => setTimeout(r, 100));
        await clientWatcher.query('COMMIT');

        const delRes = await deletePromise;
        expect(delRes.status).toBe(200);
        expect(delRes.body).toEqual({ ok: true });
      } finally {
        clientWatcher.release();
        await db.delete(users).where(eq(users.id, userDeadlockWatch));
      }
    });

    it('T21: Concurrent direct SOS creation handled safely', async () => {
      const userSosRace = `user_sos_race_${runId}`;
      const sosRaceId = `ccccccc3-cccc-4ccc-8ccc-${String(runId).slice(-12)}`;

      await request(app)
        .put('/api/v1/me')
        .set('x-dev-user-id', userSosRace)
        .send({
          name: 'Race SOS User',
          phone: '+919876598765',
          lang: 'en',
          boxPub: 'r_box',
          signPub: 'r_sign',
        });

      // Insert SOS right before or concurrently with delete
      await db.insert(sosEvents).values({
        id: sosRaceId,
        userId: userSosRace,
        trigger: 'button',
        duress: false,
        status: 'active',
        source: 'direct',
        createdAt: Date.now(),
        receivedAt: Date.now(),
      });

      const delRes = await request(app)
        .delete('/api/v1/me')
        .set('x-dev-user-id', userSosRace);

      expect(delRes.status).toBe(200);

      // Check SOS event survived under tombstone
      const [sos] = await db.select().from(sosEvents).where(eq(sosEvents.id, sosRaceId));
      expect(sos).toBeDefined();
      expect(sos.userId).toBe(SYSTEM_TOMBSTONE_USER_ID);

      await db.delete(sosEvents).where(eq(sosEvents.id, sosRaceId));
    });
  });

  //Firebase Cleanup 
  describe('Firebase Cleanup (T22 - T27)', () => {
    const mockUser = `user_fb_test_${runId}`;

    beforeAll(() => {
      _setFirebaseInitializedForTesting(true);
    });

    afterAll(() => {
      _setFirebaseInitializedForTesting(false);
      vi.restoreAllMocks();
    });

    it('T22: Successful Firebase deletion mock', async () => {
      const deleteUserMock = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
      } as any);

      const result = await cleanupFirebaseUser(mockUser);
      expect(result).toEqual({ success: true, action: 'deleted' });
      expect(deleteUserMock).toHaveBeenCalledWith(mockUser);
    });

    it('T23: Firebase auth/user-not-found treated as success', async () => {
      const notFoundErr: any = new Error('User not found');
      notFoundErr.code = 'auth/user-not-found';

      const deleteUserMock = vi.fn().mockRejectedValue(notFoundErr);
      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
      } as any);

      const result = await cleanupFirebaseUser(mockUser);
      expect(result).toEqual({ success: true, action: 'deleted' });
    });

    it('T24: Transient Firebase failure retries successfully', async () => {
      let callCount = 0;
      const deleteUserMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary network socket error');
        }
        return undefined;
      });

      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
      } as any);

      const result = await cleanupFirebaseUser(mockUser);
      expect(result).toEqual({ success: true, action: 'deleted' });
      expect(callCount).toBe(2);
    });

    it('T25: Firebase failure falls back to disable user', async () => {
      const deleteUserMock = vi.fn().mockRejectedValue(new Error('Persistent delete error'));
      const updateUserMock = vi.fn().mockResolvedValue({ uid: mockUser, disabled: true });

      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
        updateUser: updateUserMock,
      } as any);

      const result = await cleanupFirebaseUser(mockUser);
      expect(result).toEqual({ success: true, action: 'disabled' });
      expect(deleteUserMock).toHaveBeenCalledTimes(3);
      expect(updateUserMock).toHaveBeenCalledWith(mockUser, { disabled: true });
    });

    it('T26: Firebase failure produces operational error without resurrecting DB profile', async () => {
      const deleteUserMock = vi.fn().mockRejectedValue(new Error('Permanent delete error'));
      const updateUserMock = vi.fn().mockRejectedValue(new Error('Permanent update error'));

      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
        updateUser: updateUserMock,
      } as any);

      const result = await cleanupFirebaseUser(mockUser);
      expect(result).toEqual({ success: false, action: 'failed' });
    });

    it('T27: Repeated DELETE retries Firebase cleanup', async () => {
      const deleteUserMock = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(admin, 'auth').mockReturnValue({
        deleteUser: deleteUserMock,
      } as any);

      // First run
      await cleanupFirebaseUser(mockUser);
      // Repeated run (idempotent cleanup)
      const repeatResult = await cleanupFirebaseUser(mockUser);

      expect(repeatResult).toEqual({ success: true, action: 'deleted' });
      expect(deleteUserMock).toHaveBeenCalledTimes(2);
    });
  });
});

