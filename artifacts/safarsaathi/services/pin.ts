import { hashPinWithSalt, isValidPinFormat, verifyHashedPin } from '@workspace/safety-core';
import {
  getRandomBytes,
  loadPinRecord,
  loadPinThrottle,
  savePinRecord,
  savePinThrottle,
} from './secure';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export async function set(kind: 'cancel' | 'duress', pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be 4 to 6 digits');
  }

  const otherKind = kind === 'cancel' ? 'duress' : 'cancel';
  const otherRecord = await loadPinRecord(otherKind);
  if (otherRecord && verifyHashedPin(pin, otherRecord)) {
    throw new Error('Cancel PIN and duress PIN must be different');
  }

  const salt = await getRandomBytes(16);
  const hashed = hashPinWithSalt(pin, salt);
  await savePinRecord(kind, hashed);
}

/**
 * Frozen B <-> C interface (Section 15.4).
 * Verifies against cancel and duress hashes stored in expo-secure-store; throttles after 5 failures.
 */
export async function verify(pin: string): Promise<'cancel' | 'duress' | 'wrong' | 'throttled'> {
  const now = Date.now();
  const throttle = await loadPinThrottle();

  if (throttle.lockedUntilMs > now) {
    return 'throttled';
  }

  const [cancelRecord, duressRecord] = await Promise.all([
    loadPinRecord('cancel'),
    loadPinRecord('duress'),
  ]);

  if (cancelRecord && verifyHashedPin(pin, cancelRecord)) {
    await savePinThrottle({ failedCount: 0, lockedUntilMs: 0 });
    return 'cancel';
  }

  if (duressRecord && verifyHashedPin(pin, duressRecord)) {
    await savePinThrottle({ failedCount: 0, lockedUntilMs: 0 });
    return 'duress';
  }

  // Demo fallback if user has not yet configured custom PINs
  if (!cancelRecord && pin === '1234') {
    await savePinThrottle({ failedCount: 0, lockedUntilMs: 0 });
    return 'cancel';
  }
  if (!duressRecord && pin === '9999') {
    await savePinThrottle({ failedCount: 0, lockedUntilMs: 0 });
    return 'duress';
  }

  const nextCount = throttle.failedCount + 1;
  if (nextCount >= MAX_ATTEMPTS) {
    await savePinThrottle({ failedCount: 0, lockedUntilMs: now + LOCKOUT_MS });
    return 'throttled';
  }

  await savePinThrottle({ failedCount: nextCount, lockedUntilMs: 0 });
  return 'wrong';
}

