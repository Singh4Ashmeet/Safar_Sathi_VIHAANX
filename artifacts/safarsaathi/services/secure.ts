import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  bytesToBase64,
  generateBoxKeyPair,
  generateSignKeyPair,
  type BoxKeyPairB64,
  type HashedPin,
  type SignKeyPairB64,
} from '@workspace/safety-core';

const KEYS = {
  BOX_PUBLIC: 'ss_box_pub_v1',
  BOX_SECRET: 'ss_box_sec_v1',
  SIGN_PUBLIC: 'ss_sign_pub_v1',
  SIGN_SECRET: 'ss_sign_sec_v1',
  PIN_CANCEL: 'ss_pin_cancel_v1',
  PIN_DURESS: 'ss_pin_duress_v1',
  PIN_THROTTLE: 'ss_pin_throttle_v1',
  RELAY_BUNDLE: 'ss_relay_bundle_v1',
} as const;

export interface DeviceCryptoKeys {
  box: BoxKeyPairB64;
  sign: SignKeyPairB64;
}

export async function getRandomBytes(count: number): Promise<Uint8Array> {
  return Crypto.getRandomBytesAsync(count);
}

export async function ensureDeviceKeys(): Promise<DeviceCryptoKeys> {
  const [boxPub, boxSec, signPub, signSec] = await Promise.all([
    SecureStore.getItemAsync(KEYS.BOX_PUBLIC),
    SecureStore.getItemAsync(KEYS.BOX_SECRET),
    SecureStore.getItemAsync(KEYS.SIGN_PUBLIC),
    SecureStore.getItemAsync(KEYS.SIGN_SECRET),
  ]);

  if (boxPub && boxSec && signPub && signSec) {
    return {
      box: { publicKey: boxPub, secretKey: boxSec },
      sign: { publicKey: signPub, secretKey: signSec },
    };
  }

  // Generate fresh Ed25519 + X25519 keys on device; private keys never leave SecureStore
  const boxSeed = await Crypto.getRandomBytesAsync(32);
  const signSeed = await Crypto.getRandomBytesAsync(32);
  const box = generateBoxKeyPair(boxSeed);
  const sign = generateSignKeyPair(signSeed);

  await Promise.all([
    SecureStore.setItemAsync(KEYS.BOX_PUBLIC, box.publicKey),
    SecureStore.setItemAsync(KEYS.BOX_SECRET, box.secretKey),
    SecureStore.setItemAsync(KEYS.SIGN_PUBLIC, sign.publicKey),
    SecureStore.setItemAsync(KEYS.SIGN_SECRET, sign.secretKey),
  ]);

  return { box, sign };
}

export async function savePinRecord(kind: 'cancel' | 'duress', record: HashedPin): Promise<void> {
  const key = kind === 'cancel' ? KEYS.PIN_CANCEL : KEYS.PIN_DURESS;
  await SecureStore.setItemAsync(key, JSON.stringify(record));
}

export async function loadPinRecord(kind: 'cancel' | 'duress'): Promise<HashedPin | null> {
  const key = kind === 'cancel' ? KEYS.PIN_CANCEL : KEYS.PIN_DURESS;
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HashedPin;
  } catch {
    return null;
  }
}

export interface PinThrottleState {
  failedCount: number;
  lockedUntilMs: number;
}

export async function loadPinThrottle(): Promise<PinThrottleState> {
  const raw = await SecureStore.getItemAsync(KEYS.PIN_THROTTLE);
  if (!raw) return { failedCount: 0, lockedUntilMs: 0 };
  try {
    return JSON.parse(raw) as PinThrottleState;
  } catch {
    return { failedCount: 0, lockedUntilMs: 0 };
  }
}

export async function savePinThrottle(state: PinThrottleState): Promise<void> {
  await SecureStore.setItemAsync(KEYS.PIN_THROTTLE, JSON.stringify(state));
}

export async function saveRelayBundleRaw(json: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.RELAY_BUNDLE, json);
}

export async function loadRelayBundleRaw(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.RELAY_BUNDLE);
}

export function generateUuidV4(): string {
  return Crypto.randomUUID();
}

export async function randomNonce24(): Promise<Uint8Array> {
  return Crypto.getRandomBytesAsync(24);
}

export async function clearAllSecureData(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k).catch(() => undefined))
  );
}

export { bytesToBase64 };

