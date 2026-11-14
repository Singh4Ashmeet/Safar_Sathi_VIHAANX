import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  auditLog,
  db,
  guardians,
  relayPackets,
  sosDeliveries,
  sosEvents,
  users,
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

describe('FR-12: relay packet ingestion gateway', () => {
  const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = `relay_user_${runId}`;
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
      name: 'Relay Test User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: serverBox.publicKey,
      signPub: senderSign.publicKey,
      createdAt: nowMs,
    });
    await db.insert(guardians).values([
      {
        userId,
        name: 'Granted relay guardian',
        phoneE164: '+919876543211',
        relationship: 'parent',
        channels: ['sms'],
        consentStatus: 'granted',
        createdAt: nowMs,
      },
      {
        userId,
        name: 'Pending relay guardian',
        phoneE164: '+919876543212',
        relationship: 'friend',
        channels: ['sms'],
        consentStatus: 'pending',
        createdAt: nowMs,
      },
      {
        userId,
        name: 'Revoked relay guardian',
        phoneE164: '+919876543213',
        relationship: 'former contact',
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

  it('ingests an authentic packet, persists ciphertext, and creates a BLE-source SOS with consent-safe deliveries', async () => {
    const { id, raw } = packet();
    await expect(upload(raw)).resolves.toEqual([{ eventId: id, status: 'accepted' }]);

    const [stored] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, id));
    const [sos] = await db.select().from(sosEvents).where(eq(sosEvents.id, id));
    const deliveries = await db.select().from(sosDeliveries).where(eq(sosDeliveries.sosId, id));
    expect(stored.raw).toBe(bytesToBase64(raw));
    expect(stored.receivedAt).toBe(nowMs);
    expect(sos).toMatchObject({ userId, source: 'ble_gateway', trigger: 'ble_relay', duress: true });
    expect(deliveries).toHaveLength(2);
  });

  it('returns duplicate without creating a second SOS', async () => {
    const { id, raw } = packet();
    await upload(raw);
    await expect(upload(raw)).resolves.toEqual([{ eventId: id, status: 'duplicate' }]);
    const events = await db.select().from(sosEvents).where(eq(sosEvents.id, id));
    expect(events).toHaveLength(1);
  });

  it('rejects malformed encoding, wrong length, unsupported version, and zero TTL per item', async () => {
    const { raw: valid } = packet();
    const wrongVersion = new Uint8Array(valid);
    wrongVersion[0] = 2;
    const zeroTtl = new Uint8Array(valid);
    zeroTtl[191] = 0;
    const results = await service.processPackets([
      { b64: 'not base64!', receivedAt: nowMs, hops: 0 },
      { b64: bytesToBase64(valid.subarray(0, 191)), receivedAt: nowMs, hops: 0 },
      { b64: bytesToBase64(wrongVersion), receivedAt: nowMs, hops: 0 },
      { b64: bytesToBase64(zeroTtl), receivedAt: nowMs, hops: 0 },
    ]);
    expect(results.map((result) => result.status)).toEqual(['invalid', 'invalid', 'invalid', 'invalid']);
  });

  it('rejects a signed-field mutation and an unknown sender before decryption or SOS creation', async () => {
    const { raw } = packet();
    const tampered = new Uint8Array(raw);
    tampered[126] ^= 1;
    await expect(upload(tampered)).resolves.toEqual([{ eventId: expect.any(String), status: 'invalid' }]);

    const unknown = generateSignKeyPair();
    const unknownPacket = packet({ signingPublicKey: unknown.publicKey, signingSecretKey: unknown.secretKey });
    await expect(upload(unknownPacket.raw)).resolves.toEqual([{ eventId: unknownPacket.id, status: 'invalid' }]);
  });

  it('rejects a packet whose formerly registered origin account has been deleted', async () => {
    const deletedId = `relay_deleted_${runId}`;
    const deletedKey = generateSignKeyPair();
    await db.insert(users).values({
      id: deletedId,
      name: 'Deleted relay origin',
      phone: '+919876543214',
      lang: 'en',
      boxPub: serverBox.publicKey,
      signPub: deletedKey.publicKey,
      createdAt: nowMs,
    });
    const deletedPacket = packet({ signingPublicKey: deletedKey.publicKey, signingSecretKey: deletedKey.secretKey });
    await db.delete(users).where(eq(users.id, deletedId));
    await expect(upload(deletedPacket.raw)).resolves.toEqual([{ eventId: deletedPacket.id, status: 'invalid' }]);
  });

  it('rejects destination mismatch, expired/future timestamps, and a valid signature encrypted to another server key', async () => {
    await expect(upload(packet({ destination: '1111111111111111' }).raw)).resolves.toMatchObject([{ status: 'invalid' }]);
    await expect(upload(packet({ createdAtSec: nowSec - 86_401 }).raw)).resolves.toMatchObject([{ status: 'expired' }]);
    await expect(upload(packet({ createdAtSec: nowSec + 301 }).raw)).resolves.toMatchObject([{ status: 'expired' }]);
    const otherBox = generateBoxKeyPair();
    await expect(upload(packet({ serverPublicKey: otherBox.publicKey }).raw)).resolves.toMatchObject([{ status: 'invalid' }]);
  });

  it('atomically deduplicates concurrent submissions and accepts mixed batches independently', async () => {
    const concurrent = packet();
    const concurrentResults = await Promise.all([upload(concurrent.raw), upload(concurrent.raw)]);
    expect(concurrentResults.flat().map((result) => result.status).sort()).toEqual(['accepted', 'duplicate']);

    const good = packet();
    const mixed = await service.processPackets([
      { b64: bytesToBase64(good.raw), receivedAt: nowMs, hops: 0 },
      { b64: '%%%%', receivedAt: nowMs, hops: 0 },
    ]);
    expect(mixed).toEqual([{ eventId: good.id, status: 'accepted' }, { eventId: '', status: 'invalid' }]);
  });

  it('records non-sensitive relay audit actions and validates the public request schema', async () => {
    const { id, raw } = packet();
    await upload(raw);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.actor, userId), like(auditLog.resource, `relay_packet:${id}`)));
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining(['RELAY_PACKET_ACCEPTED', 'RELAY_SOS_CREATED']));

    const invalidBody = await request(app).post('/api/v1/relay/packets').send({ packets: [] });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('serves valid configured gateway requests through the established endpoint', async () => {
    const { id, raw } = packet();
    const previousSecret = env.SERVER_BOX_SECRET_KEY;
    const previousDestination = env.RELAY_DEST_TAG;
    env.SERVER_BOX_SECRET_KEY = serverBox.secretKey;
    env.RELAY_DEST_TAG = destinationTag;
    try {
      const response = await request(app)
        .post('/api/v1/relay/packets')
        .send({ packets: [{ b64: bytesToBase64(raw), receivedAt: 0, hops: 0 }] });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ results: [{ eventId: id, status: 'accepted' }] });
    } finally {
      env.SERVER_BOX_SECRET_KEY = previousSecret;
      env.RELAY_DEST_TAG = previousDestination;
    }
  });
});
