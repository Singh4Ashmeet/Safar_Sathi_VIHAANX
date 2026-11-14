import { SYSTEM_TOMBSTONE_USER_ID, db, relayPackets, users } from '@workspace/db';
import {
  PACKET_BYTE_LENGTH,
  base64ToBytes,
  bytesToBase64,
  bytesToUuid,
  computeSenderTag,
  constantTimeEqualBytes,
  decryptPacketPayload,
  epochDayFromUnixSec,
  hexToBytes,
  parsePacket,
  verifyPacketSignature,
} from '@workspace/safety-core';
import { and, eq, ne } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { auditService, type AuditAction } from '../audit/service.js';
import { sosService } from '../sos/service.js';
import { verifyBoxKeyPair } from '../../lib/crypto.js';

const MAX_PACKET_BASE64_LENGTH = 256;
const MAX_BATCH_SIZE = 50; // Enforced by schema, but defend in depth

export interface PacketUploadItem {
  b64: string;
  receivedAt: number;
  hops: number;
}

export interface PacketProcessResult {
  eventId: string;
  status: 'accepted' | 'duplicate' | 'invalid' | 'expired';
}

export interface RelayServiceOptions {
  serverBoxSecretKey?: string;
  destinationTag?: string;
  maxAgeSec?: number;
  futureSkewSec?: number;
  nowMs?: () => number;
}

type FailureStatus = Extract<PacketProcessResult['status'], 'invalid' | 'expired'>;

/**
 * Gateway-side BLE relay ingestion. Gateway-provided metadata is telemetry
 * only: authenticated packet bytes and registered sender keys are authoritative.
 */
export class RelayService {
  private validatedKeyPair = false;

  constructor(private readonly options: RelayServiceOptions = {}) {}

  /** Validate the box key pair on first use (lazy initialization). */
  private validateKeyPair(): void {
    if (this.validatedKeyPair) return;
    const secretKey = this.options.serverBoxSecretKey ?? env.SERVER_BOX_SECRET_KEY;
    const publicKey = this.options.serverBoxSecretKey ? '' : env.SERVER_BOX_PUBLIC_KEY;

    // Only validate if both are provided via environment (not test overrides)
    if (!this.options.serverBoxSecretKey && secretKey && publicKey) {
      if (!verifyBoxKeyPair(secretKey, publicKey)) {
        throw new AppError(503, 'RELAY_KEY_MISMATCH', 'SERVER_BOX_PUBLIC_KEY does not match SERVER_BOX_SECRET_KEY');
      }
    }
    this.validatedKeyPair = true;
  }

  async processPackets(packets: PacketUploadItem[]): Promise<PacketProcessResult[]> {
    // Batch size defense in depth (schema also enforces max 50)
    if (packets.length > MAX_BATCH_SIZE) {
      await this.audit('relay-gateway', 'RELAY_BATCH_OVERSIZE', 'unknown');
      throw new AppError(400, 'BATCH_TOO_LARGE', `Maximum batch size is ${MAX_BATCH_SIZE}`);
    }

    const results: PacketProcessResult[] = [];
    for (const packet of packets) {
      // The API contract is per-item: a malformed item must not discard a
      // separately valid packet in the same gateway batch.
      results.push(await this.processOne(packet));
    }
    return results;
  }

  private async processOne(item: PacketUploadItem): Promise<PacketProcessResult> {
    let eventId = '';
    try {
      // Validate key pair on first packet processing
      this.validateKeyPair();

      if (item.b64.length === 0 || item.b64.length > MAX_PACKET_BASE64_LENGTH) {
        await this.audit('relay-gateway', 'RELAY_PACKET_OVERSIZE', eventId || 'unknown');
        return this.fail(eventId, 'invalid');
      }

      let raw: Uint8Array;
      try {
        raw = base64ToBytes(item.b64);
      } catch {
        await this.audit('relay-gateway', 'RELAY_PACKET_INVALID_BASE64', eventId || 'unknown');
        return this.fail(eventId, 'invalid');
      }
      // Reject non-canonical input rather than accepting alternate encodings
      // that evade the encoded-size guard.
      if (bytesToBase64(raw) !== item.b64 || raw.length !== PACKET_BYTE_LENGTH) {
        await this.audit('relay-gateway', 'RELAY_PACKET_NON_CANONICAL', eventId || 'unknown');
        return this.fail(eventId, 'invalid');
      }

      let parsed;
      try {
        parsed = parsePacket(raw);
      } catch {
        await this.audit('relay-gateway', 'RELAY_PACKET_PARSE_FAILED', eventId || 'unknown');
        return this.fail(eventId, 'invalid');
      }
      eventId = bytesToUuid(parsed.eventId);

      if (!isUuidV4(parsed.eventId) || (parsed.flags & ~0x03) !== 0 || parsed.ttl === 0) {
        await this.audit('relay-gateway', 'RELAY_PACKET_INVALID_FORMAT', eventId);
        return this.fail(eventId, 'invalid');
      }

      const nowSec = Math.floor(this.nowMs() / 1000);
      if (
        parsed.createdAt === 0 ||
        parsed.createdAt > nowSec + this.futureSkewSec ||
        nowSec - parsed.createdAt > this.maxAgeSec
      ) {
        await this.audit('relay-gateway', 'RELAY_PACKET_EXPIRED', eventId);
        return this.fail(eventId, 'expired', 'RELAY_PACKET_EXPIRED');
      }

      if (!constantTimeEqualBytes(parsed.destTag, this.destinationTagBytes())) {
        await this.audit('relay-gateway', 'RELAY_PACKET_DESTINATION_MISMATCH', eventId);
        return this.fail(eventId, 'invalid', 'RELAY_PACKET_DESTINATION_MISMATCH');
      }

      const sender = await this.resolveSender(parsed.senderTag, nowSec);
      if (!sender) {
        await this.audit('relay-gateway', 'RELAY_PACKET_UNKNOWN_SENDER', eventId);
        return this.fail(eventId, 'invalid', 'RELAY_PACKET_UNKNOWN_SENDER');
      }

      let signPublicKey: Uint8Array;
      try {
        signPublicKey = base64ToBytes(sender.signPub);
      } catch {
        await this.audit(sender.id, 'RELAY_PACKET_UNKNOWN_SENDER', eventId);
        return this.fail(eventId, 'invalid', 'RELAY_PACKET_UNKNOWN_SENDER');
      }
      if (!verifyPacketSignature(parsed, signPublicKey)) {
        await this.audit(sender.id, 'RELAY_PACKET_INVALID_SIGNATURE', eventId);
        return this.fail(eventId, 'invalid', 'RELAY_PACKET_INVALID_SIGNATURE');
      }

      let plaintext;
      try {
        plaintext = decryptPacketPayload(parsed, this.serverBoxSecretKeyBytes());
      } catch {
        plaintext = null;
      }
      if (!plaintext || !isValidPlaintext(plaintext, nowSec, this.maxAgeSec, this.futureSkewSec)) {
        await this.audit(sender.id, 'RELAY_PACKET_DECRYPTION_FAILED', eventId);
        return this.fail(eventId, 'invalid');
      }

      const [existingPacket] = await db
        .select({ eventId: relayPackets.eventId, processingStatus: relayPackets.processingStatus })
        .from(relayPackets)
        .where(eq(relayPackets.eventId, eventId))
        .limit(1);
      if (existingPacket) {
        await this.audit(sender.id, 'RELAY_PACKET_DUPLICATE', eventId);
        return { eventId, status: 'duplicate' };
      }

      const receivedAt = this.nowMs();
      const [inserted] = await db
        .insert(relayPackets)
        .values({
          eventId,
          raw: item.b64,
          destTag: parsed.destTagHex,
          receivedAt,
          status: 'accepted',
          processingStatus: 'pending',
          attempts: 0,
          nextAttemptAt: receivedAt,
          updatedAt: receivedAt,
        })
        .onConflictDoNothing({ target: relayPackets.eventId })
        .returning({ eventId: relayPackets.eventId });
      if (!inserted) {
        await this.audit(sender.id, 'RELAY_PACKET_DUPLICATE', eventId);
        return { eventId, status: 'duplicate' };
      }

      await this.audit(sender.id, 'RELAY_PACKET_ACCEPTED', eventId);

      // Trusted internal call: this retains the established SOS idempotency,
      // consent, durable delivery and notification dispatch behavior.
      try {
        const sos = await this.createRelaySos(eventId, sender.id, parsed.createdAt, plaintext);
        await db.update(relayPackets).set({
          processingStatus: 'completed',
          sosCreatedAt: this.nowMs(),
          leaseUntil: null,
          lastError: null,
          updatedAt: this.nowMs(),
        }).where(eq(relayPackets.eventId, eventId));
        await this.audit(sender.id, 'RELAY_SOS_CREATED', sos.sosId);
        return { eventId, status: 'accepted' };
      } catch (error) {
        await this.scheduleRetry(eventId, error);
        await this.audit(sender.id, 'RELAY_PACKET_PROCESSING_FAILED', eventId);
        return { eventId, status: 'accepted' };
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      await this.audit('relay-gateway', 'RELAY_PACKET_PROCESSING_FAILED', eventId || 'unknown');
      throw error;
    }
  }

  /** Process durable packets whose inline SOS processing failed or was interrupted. */
  async processPending(eventId: string, leaseUntil?: number): Promise<'completed' | 'retry' | 'exhausted'> {
    const [row] = await db.select().from(relayPackets).where(eq(relayPackets.eventId, eventId)).limit(1);
    if (!row || row.status !== 'accepted') return 'exhausted';
    if (row.processingStatus === 'completed' || row.processingStatus === 'exhausted') return row.processingStatus;
    try {
      const raw = base64ToBytes(row.raw);
      const parsed = parsePacket(raw);
      const nowSec = Math.floor(this.nowMs() / 1000);
      if (bytesToUuid(parsed.eventId) !== eventId || (parsed.flags & ~0x03) !== 0 || parsed.ttl === 0 || parsed.createdAt === 0 || nowSec - parsed.createdAt > this.maxAgeSec || parsed.createdAt > nowSec + this.futureSkewSec) {
        await db.update(relayPackets).set({ processingStatus: 'exhausted', status: 'expired', updatedAt: this.nowMs(), leaseUntil: null }).where(this.leaseWhere(eventId, leaseUntil));
        await this.audit('relay-worker', 'RELAY_PACKET_EXPIRED', eventId);
        return 'exhausted';
      }
      if (!constantTimeEqualBytes(parsed.destTag, this.destinationTagBytes())) {
        await this.audit('relay-worker', 'RELAY_PACKET_DESTINATION_MISMATCH', eventId);
        return this.exhaust(eventId, leaseUntil);
      }
      const sender = await this.resolveSender(parsed.senderTag, nowSec);
      if (!sender || !verifyPacketSignature(parsed, base64ToBytes(sender.signPub))) {
        await this.audit('relay-worker', 'RELAY_PACKET_SIGNATURE_FAILED', eventId);
        return this.exhaust(eventId, leaseUntil);
      }
      const plaintext = decryptPacketPayload(parsed, this.serverBoxSecretKeyBytes());
      if (!plaintext || !isValidPlaintext(plaintext, nowSec, this.maxAgeSec, this.futureSkewSec)) {
        await this.audit('relay-worker', 'RELAY_PACKET_DECRYPTION_FAILED', eventId);
        return this.exhaust(eventId, leaseUntil);
      }
      const sos = await this.createRelaySos(eventId, sender.id, parsed.createdAt, plaintext);
      await db.update(relayPackets).set({ processingStatus: 'completed', sosCreatedAt: this.nowMs(), leaseUntil: null, lastError: null, updatedAt: this.nowMs() }).where(this.leaseWhere(eventId, leaseUntil));
      await this.audit(sender.id, 'RELAY_SOS_CREATED', eventId);
      return 'completed';
    } catch (error) {
      await this.scheduleRetry(eventId, error, leaseUntil);
      await this.audit('relay-worker', 'RELAY_PACKET_RETRY_SCHEDULED', eventId);
      return 'retry';
    }
  }

  private async createRelaySos(eventId: string, userId: string, createdAtSec: number, plaintext: { lat: number; lng: number; accuracyM: number; locTs: number; battery: number; duress: boolean }) {
    return sosService.createSos(userId, {
      sosId: eventId,
      trigger: 'ble_relay',
      duress: plaintext.duress,
      location: { lat: plaintext.lat, lng: plaintext.lng, acc: plaintext.accuracyM, ts: plaintext.locTs * 1000 },
      battery: plaintext.battery,
      createdAt: createdAtSec * 1000,
    }, { source: 'ble_gateway' });
  }

  private async scheduleRetry(eventId: string, error: unknown, leaseUntil?: number): Promise<void> {
    const [row] = await db.select({ attempts: relayPackets.attempts }).from(relayPackets).where(eq(relayPackets.eventId, eventId)).limit(1);
    if (!row) return;
    const attempts = row.attempts + 1;
    const exhausted = attempts >= 5;
    const delay = Math.min(300_000, 2_000 * 2 ** Math.max(0, attempts - 1)) + Math.floor(Math.random() * 1_000);
    await db.update(relayPackets).set({
      attempts,
      processingStatus: exhausted ? 'exhausted' : 'pending',
      nextAttemptAt: this.nowMs() + delay,
      leaseUntil: null,
      lastError: error instanceof Error ? error.message.slice(0, 256) : 'processing failure',
      updatedAt: this.nowMs(),
    }).where(this.leaseWhere(eventId, leaseUntil));
    if (exhausted) {
      await this.audit('relay-worker', 'RELAY_PACKET_EXHAUSTED', eventId);
    }
  }

  private async exhaust(eventId: string, leaseUntil?: number): Promise<'exhausted'> {
    await db.update(relayPackets).set({ processingStatus: 'exhausted', leaseUntil: null, updatedAt: this.nowMs() }).where(this.leaseWhere(eventId, leaseUntil));
    await this.audit('relay-worker', 'RELAY_PACKET_EXHAUSTED', eventId);
    return 'exhausted';
  }

  private leaseWhere(eventId: string, leaseUntil?: number) {
    return leaseUntil === undefined
      ? eq(relayPackets.eventId, eventId)
      : and(eq(relayPackets.eventId, eventId), eq(relayPackets.processingStatus, 'processing'), eq(relayPackets.leaseUntil, leaseUntil));
  }

  private async resolveSender(senderTag: Uint8Array, nowSec: number): Promise<{ id: string; signPub: string } | null> {
    const currentEpoch = epochDayFromUnixSec(nowSec);
    const acceptedEpochs = [currentEpoch, currentEpoch - 1];
    const candidates = await db
      .select({ id: users.id, signPub: users.signPub })
      .from(users)
      .where(ne(users.id, SYSTEM_TOMBSTONE_USER_ID));

    const matches = candidates.filter((candidate) => {
      try {
        const publicKey = base64ToBytes(candidate.signPub);
        return publicKey.length === 32 && acceptedEpochs.some((epoch) =>
          constantTimeEqualBytes(computeSenderTag(publicKey, epoch), senderTag)
        );
      } catch {
        return false;
      }
    });
    return matches.length === 1 ? matches[0] : null;
  }

  private serverBoxSecretKeyBytes(): Uint8Array {
    const encoded = this.options.serverBoxSecretKey ?? env.SERVER_BOX_SECRET_KEY;
    let key: Uint8Array;
    try {
      key = base64ToBytes(encoded);
    } catch {
      throw new AppError(503, 'RELAY_NOT_CONFIGURED', 'Relay encryption key is not configured');
    }
    if (key.length !== 32) {
      throw new AppError(503, 'RELAY_NOT_CONFIGURED', 'Relay encryption key is not configured');
    }
    return key;
  }

  private destinationTagBytes(): Uint8Array {
    const encoded = this.options.destinationTag ?? env.RELAY_DEST_TAG;
    let tag: Uint8Array;
    try {
      tag = hexToBytes(encoded);
    } catch {
      throw new AppError(503, 'RELAY_NOT_CONFIGURED', 'Relay destination tag is not configured');
    }
    if (tag.length !== 8) {
      throw new AppError(503, 'RELAY_NOT_CONFIGURED', 'Relay destination tag is not configured');
    }
    return tag;
  }

  private get maxAgeSec(): number {
    return this.options.maxAgeSec ?? env.RELAY_MAX_AGE_SEC;
  }

  private get futureSkewSec(): number {
    return this.options.futureSkewSec ?? env.RELAY_FUTURE_SKEW_SEC;
  }

  private nowMs(): number {
    return (this.options.nowMs ?? Date.now)();
  }

  private async fail(
    eventId: string,
    status: FailureStatus,
    action: AuditAction = 'RELAY_PACKET_PROCESSING_FAILED'
  ): Promise<PacketProcessResult> {
    await this.audit('relay-gateway', action, eventId || 'unknown');
    return { eventId, status };
  }

  private async audit(actor: string, action: AuditAction, eventId: string): Promise<void> {
    await auditService.record(actor, action, `relay_packet:${eventId}`);
  }
}

function isUuidV4(bytes: Uint8Array): boolean {
  return bytes.length === 16 && (bytes[6] & 0xf0) === 0x40 && (bytes[8] & 0xc0) === 0x80;
}

function isValidPlaintext(
  plaintext: { lat: number; lng: number; accuracyM: number; locTs: number; msgCode: number; battery: number; duress: boolean },
  nowSec: number,
  maxAgeSec: number,
  futureSkewSec: number
): boolean {
  return (
    Number.isFinite(plaintext.lat) && plaintext.lat >= -90 && plaintext.lat <= 90 &&
    Number.isFinite(plaintext.lng) && plaintext.lng >= -180 && plaintext.lng <= 180 &&
    Number.isInteger(plaintext.accuracyM) && plaintext.accuracyM >= 0 && plaintext.accuracyM <= 65_535 &&
    Number.isInteger(plaintext.locTs) && plaintext.locTs > 0 &&
    plaintext.locTs <= nowSec + futureSkewSec && nowSec - plaintext.locTs <= maxAgeSec &&
    Number.isInteger(plaintext.msgCode) && plaintext.msgCode >= 0 && plaintext.msgCode <= 255 &&
    Number.isInteger(plaintext.battery) && plaintext.battery >= 0 && plaintext.battery <= 100 &&
    typeof plaintext.duress === 'boolean'
  );
}

export const relayService = new RelayService();
