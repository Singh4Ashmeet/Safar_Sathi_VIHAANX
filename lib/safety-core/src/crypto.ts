import nacl from 'tweetnacl';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hmacSha256Bytes,
  utf8ToBytes,
} from './hash';

export interface BoxKeyPairB64 {
  publicKey: string;
  secretKey: string;
}

export interface SignKeyPairB64 {
  publicKey: string;
  secretKey: string;
}

export function generateBoxKeyPair(seed?: Uint8Array): BoxKeyPairB64 {
  const kp = seed ? nacl.box.keyPair.fromSecretKey(seed) : nacl.box.keyPair();
  return {
    publicKey: bytesToBase64(kp.publicKey),
    secretKey: bytesToBase64(kp.secretKey),
  };
}

export function generateSignKeyPair(seed?: Uint8Array): SignKeyPairB64 {
  const kp = seed ? nacl.sign.keyPair.fromSeed(seed) : nacl.sign.keyPair();
  return {
    publicKey: bytesToBase64(kp.publicKey),
    secretKey: bytesToBase64(kp.secretKey),
  };
}

/**
 * Spec Amendment A1:
 * senderTag = first 8 bytes of HMAC-SHA256(signPublicKey, epochDay)
 * Prevents cross-day linkability by passive BLE observers.
 */
export function computeSenderTag(signPublicKey: Uint8Array, epochDay: number): Uint8Array {
  const msg = utf8ToBytes(String(epochDay));
  return hmacSha256Bytes(signPublicKey, msg).slice(0, 8);
}

export function computeSenderTagHex(signPublicKeyB64: string, epochDay: number): string {
  return bytesToHex(computeSenderTag(base64ToBytes(signPublicKeyB64), epochDay));
}

export function epochDayFromUnixSec(unixSec: number): number {
  return Math.floor(unixSec / 86400);
}

export function boxEncryptWithEphemeral(
  plaintext: Uint8Array,
  recipientBoxPub: Uint8Array,
  nonce: Uint8Array,
  ephemeralSecret?: Uint8Array
): { ephPub: Uint8Array; ciphertext: Uint8Array } {
  if (recipientBoxPub.length !== 32) {
    throw new Error('recipientBoxPub must be 32 bytes');
  }
  if (nonce.length !== 24) {
    throw new Error('nonce must be 24 bytes');
  }
  const eph = ephemeralSecret
    ? nacl.box.keyPair.fromSecretKey(ephemeralSecret)
    : nacl.box.keyPair();
  const ciphertext = nacl.box(plaintext, nonce, recipientBoxPub, eph.secretKey);
  return { ephPub: eph.publicKey, ciphertext };
}

export function boxDecryptWithEphemeral(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  ephPub: Uint8Array,
  recipientBoxSecret: Uint8Array
): Uint8Array | null {
  return nacl.box.open(ciphertext, nonce, ephPub, recipientBoxSecret);
}

export function signDetached(message: Uint8Array, signSecretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, signSecretKey);
}

export function verifyDetached(
  message: Uint8Array,
  signature: Uint8Array,
  signPublicKey: Uint8Array
): boolean {
  if (signature.length !== 64 || signPublicKey.length !== 32) return false;
  return nacl.sign.detached.verify(message, signature, signPublicKey);
}

