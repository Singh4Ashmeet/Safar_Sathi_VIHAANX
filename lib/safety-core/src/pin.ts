import {
  bytesToHex,
  constantTimeEqualBytes,
  hexToBytes,
  sha256Bytes,
  utf8ToBytes,
} from './hash';

export interface HashedPin {
  saltHex: string;
  hashHex: string;
}

const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * Derive salted SHA-256 hash with key stretching iterations (pure-TS, Hermes & Node safe).
 */
export function hashPinWithSalt(pin: string, saltBytes: Uint8Array, iterations = 1000): HashedPin {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be 4 to 6 digits');
  }
  const pinBytes = utf8ToBytes(pin);
  let digest = new Uint8Array(saltBytes.length + pinBytes.length);
  digest.set(saltBytes, 0);
  digest.set(pinBytes, saltBytes.length);
  digest = new Uint8Array(sha256Bytes(digest));

  for (let i = 1; i < iterations; i++) {
    const nextInput = new Uint8Array(saltBytes.length + digest.length);
    nextInput.set(saltBytes, 0);
    nextInput.set(digest, saltBytes.length);
    digest = new Uint8Array(sha256Bytes(nextInput));
  }

  return {
    saltHex: bytesToHex(saltBytes),
    hashHex: bytesToHex(digest),
  };
}

export function verifyHashedPin(pin: string, stored: HashedPin, iterations = 1000): boolean {
  if (!isValidPinFormat(pin)) return false;
  try {
    const saltBytes = hexToBytes(stored.saltHex);
    const expected = hexToBytes(stored.hashHex);
    const computed = hashPinWithSalt(pin, saltBytes, iterations);
    return constantTimeEqualBytes(hexToBytes(computed.hashHex), expected);
  } catch {
    return false;
  }
}

