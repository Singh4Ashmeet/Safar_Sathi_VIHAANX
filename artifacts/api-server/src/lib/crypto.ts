import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';

/**
 * Constant-time comparison between two strings.
 * Protects against timing attacks on tokens and tick secrets.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Still perform a dummy comparison to reduce timing leaks
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Generate a cryptographically secure random token (hex string).
 */
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/**
 * SHA-256 hash of a token or input (returns hex string).
 * Share links store only this hash in Postgres.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Validate that both secret and public keys are valid base64-encoded 32-byte keys.
 * Note: Full X25519 key pair verification requires Node 19+ with crypto.webcrypto or a native binding.
 * This function performs basic format validation. For production, ensure keys are generated as a pair.
 * Returns true if both keys are valid format, false otherwise.
 * Never logs or exposes private key material.
 */
export function verifyBoxKeyPair(secretKeyB64: string, publicKeyB64: string): boolean {
  try {
    const secretKey = Buffer.from(secretKeyB64, 'base64');
    const publicKey = Buffer.from(publicKeyB64, 'base64');

    // Both must be exactly 32 bytes (256 bits) for X25519
    return secretKey.length === 32 && publicKey.length === 32;
  } catch {
    return false;
  }
}

