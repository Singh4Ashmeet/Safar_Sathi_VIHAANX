import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  auditLog,
  db,
  guardians,
  relayPackets,
  sosDeliveries,
  sosEvents,
  users,
  shareLinks,
} from '@workspace/db';
import {
  base64ToBytes,
  buildPacket,
  bytesToBase64,
  generateBoxKeyPair,
  generateSignKeyPair,
  hexToBytes,
  uuidToBytes,
} from '@workspace/safety-core';
import { and, eq, inArray, like } from 'drizzle-orm';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { RelayService } from '../src/modules/relay/service.js';
import { RelayWorker } from '../src/workers/relay.js';
import { publicService } from '../src/modules/public/service.js';
import { sha256 } from '../src/lib/crypto.js';

describe('Phase 5.5: Failure-Injection & Hardening Tests', () => {
  const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = `hardening_user_${runId}`;
  const destinationTag = '0102030405060708';
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const serverBox = generateBoxKeyPair();
  const senderSign = generateSignKeyPair();
  const service = new RelayService({
    serverBoxSecretKey: serverBox.secretKey,
    destinationTag,
    maxAgeSec: 86_400,
    futureSkewSec: 300,
    nowMs: () => nowMs,
  });
  const usedIds = new Set<string>();

  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: 'Hardening Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: serverBox.publicKey,
      signPub: senderSign.publicKey,
      createdAt: nowMs,
    });
    await db.insert(guardians).values([
      {
        userId,
        name: 'Granted Guardian',
        phoneE164: '+919876543211',
        relationship: 'parent',
        channels: ['sms'],
        consentStatus: 'granted',
        createdAt: nowMs,
      },
      {
        userId,
        name: 'Pending Guardian',
        phoneE164: '+919876543212',
        relationship: 'friend',
        channels: ['sms'],
        consentStatus: 'pending',
        createdAt: nowMs,
      },
      {
        userId,
        name: 'Revoked Guardian',
        phoneE164: '+919876543213',
        relationship: 'former',
        channels: ['sms'],
        consentStatus: 'revoked',
        createdAt: nowMs,
      },
    ]);
  });

  afterAll(async () => {
    const ids = [...usedIds];
    if (ids.length > 0) {
      await db.delete(sosDeliveries).where(inArray(sosDeliveries.sosId, ids));
      await db.delete(relayPackets).where(inArray(relayPackets.eventId, ids));
      await db.delete(sosEvents).where(inArray(sosEvents.id, ids));
    }
    await db.delete(guardians).where(eq(guardians.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  function newId(): string {
    const suffix = String(usedIds.size + 1).padStart(12, '0');
    const id = `a0a0a0a0-b0b0-4c0c-8d0d-${suffix}`;
    usedIds.add(id);
    return id;
  }

  function newUuid(): string {
    return randomUUID();
  }

  function packet(options: {
    id?: string;
    createdAtSec?: number;
    ttl?: number;
    destination?: string;
    serverPublicKey?: string;
    signingPublicKey?: string;
    signingSecretKey?: string;
  } = {}): { id: string; raw: Uint8Array } {
    const id = options.id ?? newId();
    return {
      id,
      raw: buildPacket({
        eventId: uuidToBytes(id),
        destTag: hexToBytes(options.destination ?? destinationTag),
        createdAtSec: options.createdAtSec ?? nowSec,
        ttl: options.ttl ?? 5,
        priority: 3,
        plaintext: {
          lat: 28.6139,
          lng: 77.209,
          accuracyM: 12,
          locTs: options.createdAtSec ?? nowSec,
          msgCode: 1,
          battery: 74,
          duress: true,
        },
        serverBoxPublicKey: base64ToBytes(options.serverPublicKey ?? serverBox.publicKey),
        senderSignPublicKey: base64ToBytes(options.signingPublicKey ?? senderSign.publicKey),
        senderSignSecretKey: base64ToBytes(options.signingSecretKey ?? senderSign.secretKey),
        nonce: new Uint8Array(24).fill(usedIds.size),
      }),
    };
  }

  function upload(raw: Uint8Array) {
    return service.processPackets([{ b64: bytesToBase64(raw), receivedAt: nowMs - 9_999_999, hops: 20 }]);
  }

  // =========================================================================
  // ABUSE PROTECTION TESTS
  // =========================================================================

  describe('Abuse Protection', () => {
    it('rejects oversized batch (>50 packets)', async () => {
      const oversizedBatch = Array.from({ length: 51 }, () => ({
        b64: bytesToBase64(packet().raw),
        receivedAt: nowMs,
        hops: 0,
      }));

      await expect(service.processPackets(oversizedBatch)).rejects.toThrow('Maximum batch size is 50');
    });

    it('rejects oversized individual packet', async () => {
      const largePacket = 'x'.repeat(300); // Exceeds MAX_PACKET_BASE64_LENGTH (256)
      const result = await service.processPackets([{ b64: largePacket, receivedAt: nowMs, hops: 0 }]);
      expect(result[0].status).toBe('invalid');
    });

    it('rejects invalid base64 input', async () => {
      const result = await service.processPackets([{ b64: '!!!not-base64!!!', receivedAt: nowMs, hops: 0 }]);
      expect(result[0].status).toBe('invalid');
    });
  });

  // =========================================================================
  // CONCURRENCY TESTS
  // =========================================================================

  describe('Concurrency & Duplicate Protection', () => {
    it('handles concurrent identical packet submissions atomically', async () => {
      const { raw } = packet();
      const results = await Promise.all([upload(raw), upload(raw)]);
      const statuses = results.flat().map((r) => r.status).sort();
      expect(statuses).toEqual(['accepted', 'duplicate']);
    });

    it('handles mixed valid/invalid packets in batch independently', async () => {
      const good = packet();
      const results = await service.processPackets([
        { b64: bytesToBase64(good.raw), receivedAt: nowMs, hops: 0 },
        { b64: '%%%%', receivedAt: nowMs, hops: 0 },
      ]);
      expect(results).toEqual([
        { eventId: good.id, status: 'accepted' },
        { eventId: '', status: 'invalid' },
      ]);
    });
  });

  // =========================================================================
  // RECOVERY TESTS
  // =========================================================================

  describe('Worker Recovery & Reliability', () => {
    let worker: RelayWorker;

    beforeAll(() => {
      worker = new RelayWorker();
    });

    it('recovers expired leases without leaving work stranded', async () => {
      const eventId = newUuid();
      await db.insert(relayPackets).values({
        eventId,
        raw: bytesToBase64(packet({ id: eventId }).raw),
        destTag: destinationTag,
        receivedAt: nowMs,
        status: 'accepted',
        processingStatus: 'processing',
        attempts: 1,
        nextAttemptAt: 0,
        leaseUntil: nowMs - 1, // Expired lease
        updatedAt: nowMs,
      }).onConflictDoNothing();

      const recovered = await worker.recoverExpiredLeases(nowMs);
      expect(recovered).toBeGreaterThanOrEqual(1);

      const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
      expect(row.processingStatus).toBe('pending');
      expect(row.leaseUntil).toBeNull();
    });

    it('does not reclaim active leases', async () => {
      const eventId = newUuid();
      await db.insert(relayPackets).values({
        eventId,
        raw: bytesToBase64(packet({ id: eventId }).raw),
        destTag: destinationTag,
        receivedAt: nowMs,
        status: 'accepted',
        processingStatus: 'processing',
        attempts: 1,
        nextAttemptAt: 0,
        leaseUntil: nowMs + 60_000, // Active lease
        updatedAt: nowMs,
      }).onConflictDoNothing();

      const recovered = await worker.recoverExpiredLeases(nowMs);
      expect(recovered).toBe(0);

      const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
      expect(row.processingStatus).toBe('processing');
    });

    it('enforces maximum retry attempts (exhausted state)', async () => {
      const eventId = newUuid();
      await db.insert(relayPackets).values({
        eventId,
        raw: bytesToBase64(packet({ id: eventId }).raw),
        destTag: destinationTag,
        receivedAt: nowMs,
        status: 'accepted',
        processingStatus: 'processing',
        attempts: 4, // One away from max
        nextAttemptAt: 0,
        leaseUntil: nowMs - 1,
        updatedAt: nowMs,
      }).onConflictDoNothing();

      await worker.recoverExpiredLeases(nowMs);
      await worker.runDueJobs(nowMs + 2);

      const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
      expect(row.processingStatus).toBe('exhausted');
      expect(row.attempts).toBe(5);
    });

    it('handles malformed durable work without crashing worker', async () => {
      const eventId = newUuid();
      await db.insert(relayPackets).values({
        eventId,
        raw: Buffer.alloc(192).toString('base64'), // Invalid packet data
        destTag: destinationTag,
        receivedAt: nowMs,
        status: 'accepted',
        processingStatus: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        updatedAt: nowMs,
      }).onConflictDoNothing();

      const result = await worker.runDueJobs(nowMs + 1);
      expect(result.claimed).toBeGreaterThanOrEqual(1);

      const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId));
      expect(['pending', 'exhausted']).toContain(row.processingStatus);
    });

    it('provides health visibility', async () => {
      const health = worker.getHealth();
      expect(health).toHaveProperty('running');
      expect(health).toHaveProperty('lastRunAt');
      expect(health).toHaveProperty('lastRunResult');
      expect(health).toHaveProperty('consecutiveFailures');
    });

    it('supports graceful shutdown', async () => {
      await worker.shutdown();
      expect(worker.isShuttingDown()).toBe(true);
    });
  });

  // =========================================================================
  // SECURITY TESTS
  // =========================================================================

  describe('Security: Tracking Link Authorization', () => {
    it('rejects access with revoked guardian consent', async () => {
      const sosId = newUuid();
      const guardianId = randomUUID();

      await db.insert(sosEvents).values({
        id: sosId,
        userId,
        trigger: 'ble_relay',
        duress: false,
        status: 'active',
        source: 'ble_gateway',
        createdAt: nowMs,
        receivedAt: nowMs,
      });

      await db.insert(guardians).values({
        id: guardianId,
        userId,
        name: 'Revoked Guardian',
        phoneE164: '+919876543214',
        relationship: 'former',
        channels: ['sms'],
        consentStatus: 'revoked',
        createdAt: nowMs,
      });

      const token = `tracking-token-${Date.now()}`;
      await db.insert(shareLinks).values({
        tokenHash: sha256(token),
        sosId,
        guardianId,
        expiresAt: nowMs + 60_000,
        createdAt: nowMs,
      });

      // Should fail with 403 FORBIDDEN
      await expect(publicService.getTrackingByToken(token)).rejects.toThrow('Guardian access is no longer permitted');
    });

    it('rejects access with expired tracking token', async () => {
      const sosId = newUuid();
      const token = `expired-token-${Date.now()}`;

      await db.insert(sosEvents).values({
        id: sosId,
        userId,
        trigger: 'ble_relay',
        duress: false,
        status: 'active',
        source: 'ble_gateway',
        createdAt: nowMs,
        receivedAt: nowMs,
      });

      await db.insert(shareLinks).values({
        tokenHash: sha256(token),
        sosId,
        guardianId: null,
        expiresAt: nowMs - 1000, // Expired
        createdAt: nowMs,
      });

      try {
        await publicService.getTrackingByToken(token);
        throw new Error('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('LINK_EXPIRED');
      }
    });

    it('rejects access with revoked share link', async () => {
      const sosId = newUuid();
      const token = `revoked-token-${Date.now()}`;

      await db.insert(sosEvents).values({
        id: sosId,
        userId,
        trigger: 'ble_relay',
        duress: false,
        status: 'active',
        source: 'ble_gateway',
        createdAt: nowMs,
        receivedAt: nowMs,
      });

      await db.insert(shareLinks).values({
        tokenHash: sha256(token),
        sosId,
        guardianId: null,
        expiresAt: nowMs + 60_000,
        revokedAt: nowMs - 1000, // Revoked
        createdAt: nowMs,
      });

      try {
        await publicService.getTrackingByToken(token);
        throw new Error('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('LINK_REVOKED');
      }
    });

    it('rejects access for tombstone user SOS', async () => {
      const sosId = newUuid();
      const token = `tombstone-token-${Date.now()}`;

      await db.insert(sosEvents).values({
        id: sosId,
        userId: 'system_tombstone_user',
        trigger: 'ble_relay',
        duress: false,
        status: 'active',
        source: 'ble_gateway',
        createdAt: nowMs,
        receivedAt: nowMs,
      });

      await db.insert(shareLinks).values({
        tokenHash: sha256(token),
        sosId,
        guardianId: null,
        expiresAt: nowMs + 60_000,
        createdAt: nowMs,
      });

      try {
        await publicService.getTrackingByToken(token);
        throw new Error('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
      }
    });

    it('rejects access for cancelled/resolved SOS', async () => {
      const sosId = newUuid();
      const token = `cancelled-token-${Date.now()}`;

      await db.insert(sosEvents).values({
        id: sosId,
        userId,
        trigger: 'ble_relay',
        duress: false,
        status: 'cancelled',
        source: 'ble_gateway',
        createdAt: nowMs,
        receivedAt: nowMs,
      });

      await db.insert(shareLinks).values({
        tokenHash: sha256(token),
        sosId,
        guardianId: null,
        expiresAt: nowMs + 60_000,
        createdAt: nowMs,
      });

      const result = await publicService.getTrackingByToken(token);
      expect(result.isExpired).toBe(true);
    });
  });

  // =========================================================================
  // AUDIT LOGGING TESTS
  // =========================================================================

  describe('Audit Logging - Non-Sensitive Events', () => {
    it('records relay packet accepted events', async () => {
      const { id, raw } = packet();
      await upload(raw);

      const audits = await db.select().from(auditLog).where(
        and(eq(auditLog.actor, userId), like(auditLog.resource, `relay_packet:${id}`))
      );
      const actions = audits.map((a) => a.action);
      expect(actions).toContain('RELAY_PACKET_ACCEPTED');
      expect(actions).toContain('RELAY_SOS_CREATED');
    });

    it('records relay packet duplicate events', async () => {
      const { id, raw } = packet();
      await upload(raw);
      await upload(raw); // Duplicate

      const audits = await db.select().from(auditLog).where(
        and(eq(auditLog.actor, userId), like(auditLog.resource, `relay_packet:${id}`))
      );
      const duplicateActions = audits.filter((a) => a.action === 'RELAY_PACKET_DUPLICATE');
      expect(duplicateActions.length).toBeGreaterThanOrEqual(1);
    });

    it('records relay packet invalid base64 events', async () => {
      await service.processPackets([{ b64: '!!!invalid!!!', receivedAt: nowMs, hops: 0 }]);

      const audits = await db.select().from(auditLog).where(
        and(eq(auditLog.actor, 'relay-gateway'), eq(auditLog.action, 'RELAY_PACKET_INVALID_BASE64'))
      );
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    it('records relay packet expired events', async () => {
      const { raw } = packet({ createdAtSec: nowSec - 86_401 }); // Expired
      await upload(raw);

      const audits = await db.select().from(auditLog).where(
        and(eq(auditLog.actor, 'relay-gateway'), eq(auditLog.action, 'RELAY_PACKET_EXPIRED'))
      );
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    it('records relay packet signature failure events', async () => {
      const { raw } = packet();
      const tampered = new Uint8Array(raw);
      tampered[126] ^= 1; // Flip a bit in signature
      await upload(tampered);

      const audits = await db.select().from(auditLog).where(
        and(eq(auditLog.actor, userId), eq(auditLog.action, 'RELAY_PACKET_INVALID_SIGNATURE'))
      );
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });
  });
});