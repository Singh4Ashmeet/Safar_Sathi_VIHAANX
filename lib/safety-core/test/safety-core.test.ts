import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import {
  BeaconReassembler,
  RelayEngine,
  RiskTracker,
  SimMeshHub,
  SimTransport,
  base64ToBytes,
  buildPacket,
  bytesToBase64,
  bytesToHex,
  bytesToUuid,
  computeRisk,
  computeSenderTag,
  decodePolyline,
  decryptPacketPayload,
  decrementPacketTtl,
  epochDayFromUnixSec,
  fragmentPacket,
  generateBoxKeyPair,
  generateSignKeyPair,
  hashPinWithSalt,
  hexToBytes,
  normalizePhoneE164,
  parsePacket,
  straightLineRouteFallback,
  utf8ToBytes,
  uuidToBytes,
  verifyHashedPin,
  verifyPacketSignature,
  PACKET_BYTE_LENGTH,
} from '../src/index.js';
import vectors from '../test-vectors.json' with { type: 'json' };

describe('riskEngine (ported + stationary time-driven fix)', () => {
  it('computes safe, warning, and danger thresholds', () => {
    expect(
      computeRisk({ routeDeviation: false, unusualStop: false, noResponse: false, unsafeZone: false })
    ).toEqual({ score: 0, level: 'safe', triggers: [] });

    expect(
      computeRisk({ routeDeviation: true, unusualStop: false, noResponse: false, unsafeZone: false })
    ).toMatchObject({ score: 30, level: 'safe' });

    expect(
      computeRisk({ routeDeviation: true, unusualStop: false, noResponse: false, unsafeZone: true })
    ).toMatchObject({ score: 50, level: 'warning' });

    expect(
      computeRisk({ routeDeviation: true, unusualStop: true, noResponse: true, unsafeZone: false })
    ).toMatchObject({ score: 95, level: 'danger' });
  });

  it('triggers unusual stop on stationary time-driven updates', () => {
    const tracker = new RiskTracker({ stopTimeMs: 300_000, alertCooldownMs: 120_000 });
    const route = [
      { lat: 28.6139, lng: 77.209 },
      { lat: 28.6239, lng: 77.219 },
    ];
    const t0 = 1_700_000_000_000;
    const first = tracker.evaluate({ lat: 28.6139, lng: 77.209, ts: t0 }, route);
    expect(first.flags.unusualStop).toBe(false);

    // 6 minutes later at exact same coordinates -> must flag stop
    const later = tracker.evaluate({ lat: 28.6139, lng: 77.209, ts: t0 + 360_000 }, route);
    expect(later.flags.unusualStop).toBe(true);
  });

  it('triggers route deviation after sustained off-route movement', () => {
    const tracker = new RiskTracker({ deviationThresholdKm: 0.3, deviationSustainedMs: 30_000 });
    const route = [
      { lat: 28.6139, lng: 77.209 },
      { lat: 28.6239, lng: 77.209 },
    ];
    const t0 = 1_700_000_000_000;
    const r1 = tracker.evaluate({ lat: 28.615, lng: 77.225, ts: t0 }, route);
    expect(r1.flags.routeDeviation).toBe(false);
    const r2 = tracker.evaluate({ lat: 28.615, lng: 77.225, ts: t0 + 35_000 }, route);
    expect(r2.flags.routeDeviation).toBe(true);
  });
});

describe('geo + phone + pin helpers', () => {
  it('decodes polylines and computes straight-line fallback', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts.length).toBe(3);
    expect(pts[0].lat).toBeCloseTo(38.5, 4);
    expect(pts[0].lng).toBeCloseTo(-120.2, 4);

    const fb = straightLineRouteFallback({ lat: 28.6139, lng: 77.209 }, { lat: 28.7041, lng: 77.1025 });
    expect(fb.distanceM).toBeGreaterThan(10_000);
    expect(fb.durationSec).toBeGreaterThan(600);
  });

  it('normalizes phone numbers to E.164 with +91 default', () => {
    expect(normalizePhoneE164('98765 43210')).toBe('+919876543210');
    expect(normalizePhoneE164('09876543210')).toBe('+919876543210');
    expect(normalizePhoneE164('+91-98765-43210')).toBe('+919876543210');
    expect(normalizePhoneE164('+1 415 555 2671')).toBe('+14155552671');
  });

  it('hashes and verifies PINs in constant time', () => {
    const salt = utf8ToBytes('0123456789abcdef');
    const hashed = hashPinWithSalt('2580', salt, 100);
    expect(verifyHashedPin('2580', hashed, 100)).toBe(true);
    expect(verifyHashedPin('2581', hashed, 100)).toBe(false);
  });
});

describe('BLE packet codec, crypto & golden vectors', () => {
  it('matches golden test vectors byte-for-byte', () => {
    for (const vec of vectors.vectors) {
      const serverBox = nacl.box.keyPair.fromSecretKey(base64ToBytes(vec.serverBoxSecretKeyB64));
      const senderSign = nacl.sign.keyPair.fromSeed(hexToBytes(vec.senderSignSeedHex));
      const ephSecret = hexToBytes(vec.ephemeralSecretHex);
      const nonce = hexToBytes(vec.nonceHex);
      const eventId = uuidToBytes(vec.sosId);
      const destTag = hexToBytes(vec.destTagHex);

      const raw = buildPacket({
        eventId,
        destTag,
        createdAtSec: vec.createdAtSec,
        epochDay: vec.epochDay,
        ttl: vec.ttl,
        priority: vec.priority,
        plaintext: vec.plaintext,
        serverBoxPublicKey: serverBox.publicKey,
        senderSignPublicKey: senderSign.publicKey,
        senderSignSecretKey: senderSign.secretKey,
        nonce,
        ephemeralSecretKey: ephSecret,
      });

      expect(raw.length).toBe(PACKET_BYTE_LENGTH);
      expect(bytesToBase64(raw)).toBe(vec.packetB64);

      const parsed = parsePacket(raw);
      expect(bytesToUuid(parsed.eventId)).toBe(vec.sosId);
      expect(parsed.senderTagHex).toBe(vec.expectedSenderTagHex);
      expect(verifyPacketSignature(parsed, senderSign.publicKey)).toBe(true);

      const decrypted = decryptPacketPayload(parsed, serverBox.secretKey);
      expect(decrypted).not.toBeNull();
      expect(decrypted!.lat).toBeCloseTo(vec.plaintext.lat, 6);
      expect(decrypted!.lng).toBeCloseTo(vec.plaintext.lng, 6);
      expect(decrypted!.duress).toBe(vec.plaintext.duress);
      expect(decrypted!.battery).toBe(vec.plaintext.battery);

      // Decrementing TTL preserves signature validity
      const hopped = decrementPacketTtl(raw);
      const parsedHop = parsePacket(hopped);
      expect(parsedHop.ttl).toBe(vec.ttl - 1);
      expect(verifyPacketSignature(parsedHop, senderSign.publicKey)).toBe(true);
    }
  });

  it('fragments and reassembles a 192-byte packet over ~23-byte beacons', () => {
    const box = generateBoxKeyPair();
    const sign = generateSignKeyPair();
    const nowSec = 1_762_900_000;
    const raw = buildPacket({
      eventId: uuidToBytes('11111111-2222-4333-8444-555555555555'),
      destTag: hexToBytes('a1b2c3d4e5f60708'),
      createdAtSec: nowSec,
      plaintext: {
        lat: 28.6139123,
        lng: 77.2090123,
        accuracyM: 12,
        locTs: nowSec,
        msgCode: 1,
        battery: 84,
        duress: false,
      },
      serverBoxPublicKey: base64ToBytes(box.publicKey),
      senderSignPublicKey: base64ToBytes(sign.publicKey),
      senderSignSecretKey: base64ToBytes(sign.secretKey),
      nonce: new Uint8Array(24).fill(7),
    });

    const frags = fragmentPacket(raw);
    expect(frags.length).toBe(12);
    const reassembler = new BeaconReassembler();
    let result: Uint8Array | null = null;
    for (const f of frags.reverse()) {
      result = reassembler.ingestFragment(f);
    }
    expect(result).not.toBeNull();
    expect(bytesToHex(result!)).toBe(bytesToHex(raw));
  });

  it('rotates senderTag per epochDay', () => {
    const sign = generateSignKeyPair();
    const pub = base64ToBytes(sign.publicKey);
    const tag1 = bytesToHex(computeSenderTag(pub, epochDayFromUnixSec(1_762_900_000)));
    const tag2 = bytesToHex(computeSenderTag(pub, epochDayFromUnixSec(1_762_900_000) + 1));
    expect(tag1).not.toBe(tag2);
  });
});

describe('RelayEngine + SimTransport', () => {
  it('relays across A -> B -> C and deduplicates loops', async () => {
    const box = generateBoxKeyPair();
    const sign = generateSignKeyPair();
    const nowSec = 1_762_900_000;
    const nowMs = nowSec * 1000;

    const raw = buildPacket({
      eventId: uuidToBytes('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      destTag: hexToBytes('0102030405060708'),
      createdAtSec: nowSec,
      ttl: 5,
      plaintext: {
        lat: 19.076,
        lng: 72.8777,
        accuracyM: 15,
        locTs: nowSec,
        msgCode: 1,
        battery: 52,
        duress: true,
      },
      serverBoxPublicKey: base64ToBytes(box.publicKey),
      senderSignPublicKey: base64ToBytes(sign.publicKey),
      senderSignSecretKey: base64ToBytes(sign.secretKey),
      nonce: new Uint8Array(24).fill(9),
    });

    const hub = new SimMeshHub();
    const nodeA = new SimTransport('A', hub);
    const nodeB = new SimTransport('B', hub);
    const nodeC = new SimTransport('C', hub);
    hub.connect('A', 'B');
    hub.connect('B', 'C');

    const engineB = new RelayEngine();
    const engineC = new RelayEngine();

    nodeB.onPacket(async (pkt, peerId) => {
      const dec = engineB.ingest(pkt, peerId, nowMs);
      if (dec.accepted) {
        for (const neighbor of nodeB.peers()) {
          if (neighbor !== peerId) await nodeB.send(dec.packet.raw, neighbor);
        }
      }
    });

    nodeC.onPacket((pkt, peerId) => {
      engineC.ingest(pkt, peerId, nowMs);
    });

    await nodeA.start();
    await nodeB.start();
    await nodeC.start();

    await nodeA.send(raw);
    expect(engineB.getQueuedCount()).toBe(1);
    expect(engineC.getQueuedCount()).toBe(1);
    expect(engineC.getAllQueued()[0].ttl).toBe(3);

    // Duplicate send must be ignored
    await nodeA.send(raw);
    expect(engineB.getQueuedCount()).toBe(1);
    expect(engineC.getQueuedCount()).toBe(1);
  });
});

