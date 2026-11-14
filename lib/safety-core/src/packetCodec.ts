import { bytesToHex, hexToBytes } from './hash';
import {
  boxDecryptWithEphemeral,
  boxEncryptWithEphemeral,
  computeSenderTag,
  epochDayFromUnixSec,
  signDetached,
  verifyDetached,
} from './crypto';

/**
 * Section 11.2 — Binary BLE SOS Relay Packet v1 (exact 192 bytes):
 *   ver(1) | flags(1) | eventId(16) | destTag(8) | createdAt(4) | senderTag(8)
 *   | ephPub(32) | nonce(24) | ciphertext(33) | signature(64) | ttl(1)
 *
 * Plaintext (17 bytes):
 *   lat_i32(4) | lon_i32(4) | accuracyM_u16(2) | locTs_u32(4) | msgCode_u8(1) | battery_u8(1) | duress_u8(1)
 * Ciphertext = 17 + 16 MAC = 33 bytes.
 * Ed25519 signature covers bytes [0..126] (all fields except signature and mutable ttl).
 */

export const PACKET_VERSION = 1;
export const PACKET_BYTE_LENGTH = 192;
export const PLAINTEXT_BYTE_LENGTH = 17;
export const CIPHERTEXT_BYTE_LENGTH = 33;
export const SIGNATURE_OFFSET = 127;
export const TTL_OFFSET = 191;

export interface SosPlaintext {
  lat: number;
  lng: number;
  accuracyM: number;
  locTs: number;
  msgCode: number;
  battery: number;
  duress: boolean;
}

export interface ParsedSosPacket {
  ver: number;
  flags: number;
  priority: number;
  eventId: Uint8Array;
  eventIdHex: string;
  destTag: Uint8Array;
  destTagHex: string;
  createdAt: number;
  senderTag: Uint8Array;
  senderTagHex: string;
  ephPub: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  signature: Uint8Array;
  ttl: number;
  signedRegion: Uint8Array;
}

export interface BuildPacketParams {
  eventId: Uint8Array; // 16 bytes (UUIDv4 bytes)
  destTag: Uint8Array; // 8 bytes
  createdAtSec: number;
  epochDay?: number;
  ttl?: number;
  priority?: number; // 3 = critical
  plaintext: SosPlaintext;
  serverBoxPublicKey: Uint8Array;
  senderSignPublicKey: Uint8Array;
  senderSignSecretKey: Uint8Array;
  nonce: Uint8Array; // 24 random bytes
  ephemeralSecretKey?: Uint8Array; // optional deterministic override for test vectors
}

export function uuidToBytes(uuid: string): Uint8Array {
  const clean = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return hexToBytes(clean);
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('UUID bytes must be 16 bytes');
  const h = bytesToHex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function encodePlaintext(p: SosPlaintext): Uint8Array {
  const buf = new Uint8Array(PLAINTEXT_BYTE_LENGTH);
  const view = new DataView(buf.buffer);
  view.setInt32(0, Math.round(p.lat * 1e7), false);
  view.setInt32(4, Math.round(p.lng * 1e7), false);
  view.setUint16(8, Math.max(0, Math.min(65535, Math.round(p.accuracyM))), false);
  view.setUint32(10, p.locTs >>> 0, false);
  view.setUint8(14, p.msgCode & 0xff);
  view.setUint8(15, Math.max(0, Math.min(100, Math.round(p.battery))) & 0xff);
  view.setUint8(16, p.duress ? 1 : 0);
  return buf;
}

export function decodePlaintext(buf: Uint8Array): SosPlaintext {
  if (buf.length !== PLAINTEXT_BYTE_LENGTH) {
    throw new Error(`Expected ${PLAINTEXT_BYTE_LENGTH}-byte plaintext, got ${buf.length}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    lat: view.getInt32(0, false) / 1e7,
    lng: view.getInt32(4, false) / 1e7,
    accuracyM: view.getUint16(8, false),
    locTs: view.getUint32(10, false),
    msgCode: view.getUint8(14),
    battery: view.getUint8(15),
    duress: view.getUint8(16) !== 0,
  };
}

export function buildPacket(params: BuildPacketParams): Uint8Array {
  if (params.eventId.length !== 16) throw new Error('eventId must be 16 bytes');
  if (params.destTag.length !== 8) throw new Error('destTag must be 8 bytes');
  if (params.nonce.length !== 24) throw new Error('nonce must be 24 bytes');
  if (params.senderSignPublicKey.length !== 32) throw new Error('senderSignPublicKey must be 32 bytes');
  if (params.senderSignSecretKey.length !== 64) throw new Error('senderSignSecretKey must be 64 bytes');

  const epochDay = params.epochDay ?? epochDayFromUnixSec(params.createdAtSec);
  const senderTag = computeSenderTag(params.senderSignPublicKey, epochDay);
  const plaintextBytes = encodePlaintext(params.plaintext);
  const { ephPub, ciphertext } = boxEncryptWithEphemeral(
    plaintextBytes,
    params.serverBoxPublicKey,
    params.nonce,
    params.ephemeralSecretKey
  );

  if (ciphertext.length !== CIPHERTEXT_BYTE_LENGTH) {
    throw new Error(`Unexpected ciphertext length: ${ciphertext.length}`);
  }

  const out = new Uint8Array(PACKET_BYTE_LENGTH);
  const view = new DataView(out.buffer);
  const priority = (params.priority ?? 3) & 0x03;

  out[0] = PACKET_VERSION;
  out[1] = priority;
  out.set(params.eventId, 2);
  out.set(params.destTag, 18);
  view.setUint32(26, params.createdAtSec >>> 0, false);
  out.set(senderTag, 30);
  out.set(ephPub, 38);
  out.set(params.nonce, 70);
  out.set(ciphertext, 94);

  const signedRegion = out.subarray(0, SIGNATURE_OFFSET);
  const signature = signDetached(signedRegion, params.senderSignSecretKey);
  out.set(signature, SIGNATURE_OFFSET);

  out[TTL_OFFSET] = (params.ttl ?? 10) & 0xff;
  return out;
}

export function parsePacket(raw: Uint8Array): ParsedSosPacket {
  if (raw.length !== PACKET_BYTE_LENGTH) {
    throw new Error(`Invalid packet length: expected ${PACKET_BYTE_LENGTH}, got ${raw.length}`);
  }
  const ver = raw[0];
  if (ver !== PACKET_VERSION) {
    throw new Error(`Unsupported packet version: ${ver}`);
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const flags = raw[1];
  const eventId = raw.slice(2, 18);
  const destTag = raw.slice(18, 26);
  const createdAt = view.getUint32(26, false);
  const senderTag = raw.slice(30, 38);
  const ephPub = raw.slice(38, 70);
  const nonce = raw.slice(70, 94);
  const ciphertext = raw.slice(94, 127);
  const signature = raw.slice(127, 191);
  const ttl = raw[TTL_OFFSET];

  return {
    ver,
    flags,
    priority: flags & 0x03,
    eventId,
    eventIdHex: bytesToHex(eventId),
    destTag,
    destTagHex: bytesToHex(destTag),
    createdAt,
    senderTag,
    senderTagHex: bytesToHex(senderTag),
    ephPub,
    nonce,
    ciphertext,
    signature,
    ttl,
    signedRegion: raw.slice(0, SIGNATURE_OFFSET),
  };
}

export function verifyPacketSignature(
  packet: ParsedSosPacket,
  senderSignPublicKey: Uint8Array
): boolean {
  return verifyDetached(packet.signedRegion, packet.signature, senderSignPublicKey);
}

export function decryptPacketPayload(
  packet: ParsedSosPacket,
  serverBoxSecretKey: Uint8Array
): SosPlaintext | null {
  const plain = boxDecryptWithEphemeral(
    packet.ciphertext,
    packet.nonce,
    packet.ephPub,
    serverBoxSecretKey
  );
  if (!plain) return null;
  return decodePlaintext(plain);
}

export function decrementPacketTtl(raw: Uint8Array): Uint8Array {
  if (raw.length !== PACKET_BYTE_LENGTH) {
    throw new Error('Invalid packet length');
  }
  const copy = new Uint8Array(raw);
  if (copy[TTL_OFFSET] > 0) {
    copy[TTL_OFFSET] = copy[TTL_OFFSET] - 1;
  }
  return copy;
}

// ─── Beacon Fragmentation (Section 11.5: ~12 fragments of ~20 bytes) ─────────
// Fragment layout (22 bytes max):
//   [0] type = 0x53 ('S')
//   [1..4] shortEventId (first 4 bytes of eventId)
//   [5] index (0-based)
//   [6] count (total fragments)
//   [7..] chunk bytes (up to 16 bytes; 192 / 16 = 12 fragments)

export const BEACON_FRAGMENT_MAGIC = 0x53;
export const BEACON_FRAGMENT_HEADER_LEN = 7;

export function fragmentPacket(raw: Uint8Array, chunkBytes = 16): Uint8Array[] {
  if (raw.length !== PACKET_BYTE_LENGTH) {
    throw new Error(`Expected ${PACKET_BYTE_LENGTH}-byte packet`);
  }
  const count = Math.ceil(raw.length / chunkBytes);
  const shortId = raw.subarray(2, 6);
  const fragments: Uint8Array[] = [];

  for (let i = 0; i < count; i++) {
    const slice = raw.subarray(i * chunkBytes, Math.min(raw.length, (i + 1) * chunkBytes));
    const frag = new Uint8Array(BEACON_FRAGMENT_HEADER_LEN + slice.length);
    frag[0] = BEACON_FRAGMENT_MAGIC;
    frag.set(shortId, 1);
    frag[5] = i;
    frag[6] = count;
    frag.set(slice, BEACON_FRAGMENT_HEADER_LEN);
    fragments.push(frag);
  }
  return fragments;
}

export class BeaconReassembler {
  private readonly buckets = new Map<
    string,
    { count: number; chunks: Map<number, Uint8Array>; updatedAt: number }
  >();

  ingestFragment(frag: Uint8Array, nowMs = Date.now()): Uint8Array | null {
    if (frag.length <= BEACON_FRAGMENT_HEADER_LEN || frag[0] !== BEACON_FRAGMENT_MAGIC) {
      return null;
    }
    const shortIdHex = bytesToHex(frag.subarray(1, 5));
    const index = frag[5];
    const count = frag[6];
    if (count === 0 || index >= count || count > 32) return null;

    let bucket = this.buckets.get(shortIdHex);
    if (!bucket || bucket.count !== count) {
      bucket = { count, chunks: new Map(), updatedAt: nowMs };
      this.buckets.set(shortIdHex, bucket);
    }
    bucket.updatedAt = nowMs;
    if (!bucket.chunks.has(index)) {
      bucket.chunks.set(index, frag.slice(BEACON_FRAGMENT_HEADER_LEN));
    }

    if (bucket.chunks.size < count) return null;

    const parts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = 0; i < count; i++) {
      const part = bucket.chunks.get(i);
      if (!part) return null;
      parts.push(part);
      totalLen += part.length;
    }
    this.buckets.delete(shortIdHex);

    if (totalLen !== PACKET_BYTE_LENGTH) return null;
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  pruneExpired(maxAgeMs = 60_000, nowMs = Date.now()): void {
    for (const [key, val] of this.buckets.entries()) {
      if (nowMs - val.updatedAt > maxAgeMs) {
        this.buckets.delete(key);
      }
    }
  }
}

