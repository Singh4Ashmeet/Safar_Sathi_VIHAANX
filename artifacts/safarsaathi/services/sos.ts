import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import { Accelerometer } from 'expo-sensors';
import { createSos, getSosStatus } from '@workspace/api-client-react';
import {
  beginServerRequest,
  reportServerOffline,
  reportServerSuccess,
} from './connectivity';
import {
  bumpSosOutboxRetry,
  getPendingSosOutbox,
  markSosOutboxSent,
  upsertSosOutbox,
} from './outbox';
import { generateUuidV4 } from './secure';
import { getLatestLocation } from './tracking';

export type SosLifecycleStatus = 'sending' | 'active' | 'acknowledged' | 'resolved' | 'cancelled';

export interface SosUiState {
  status: SosLifecycleStatus;
  deliveries: { guardianId: string; channel: string; status: string }[];
  viaRelay: boolean;
  smsFallbackReady: boolean;
}

const _sosStates = new Map<string, SosUiState>();
const _sosListeners = new Map<string, Set<(s: SosUiState) => void>>();
let _retryTimer: ReturnType<typeof setInterval> | null = null;

function setSosState(sosId: string, next: SosUiState): void {
  _sosStates.set(sosId, next);
  _sosListeners.get(sosId)?.forEach((fn) => fn(next));
}

function getDefaultState(): SosUiState {
  return { status: 'sending', deliveries: [], viaRelay: false, smsFallbackReady: false };
}

async function getBatteryPercent(): Promise<number | undefined> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) return Math.round(level * 100);
  } catch {}
  return undefined;
}

export async function flushPendingSos(): Promise<void> {
  const pending = await getPendingSosOutbox(Date.now());
  for (const row of pending) {
    const cancelWaking = beginServerRequest();
    try {
      const payload = JSON.parse(row.payload_json) as Parameters<typeof createSos>[0];
      const res = await createSos(payload);
      cancelWaking();
      reportServerSuccess();
      await markSosOutboxSent(row.sos_id);
      setSosState(row.sos_id, {
        status: res.status,
        deliveries: res.guardians.map((g) => ({
          guardianId: g.guardianId,
          channel: g.channel,
          status: g.status,
        })),
        viaRelay: false,
        smsFallbackReady: false,
      });
    } catch {
      cancelWaking();
      reportServerOffline();
      const backoffMs = Math.min(30_000, 2_000 * Math.pow(2, row.attempts));
      await bumpSosOutboxRetry(row.sos_id, Date.now() + backoffMs);
    }
  }
}

function ensureRetryLoop(): void {
  if (_retryTimer) return;
  _retryTimer = setInterval(() => {
    void flushPendingSos();
  }, 5_000);
}

/**
 * Frozen B <-> C interface (Section 15.4).
 * Generates client UUIDv4 sosId, persists to SQLite outbox first, posts idempotently,
 * and enables SMS-intent fallback after 20 s without server confirmation (Section 12.3).
 */
export async function trigger(o: {
  trigger: 'button' | 'shake' | 'prompt_timeout';
  tripId?: string;
}): Promise<{ sosId: string }> {
  const sosId = generateUuidV4();
  const createdAt = Date.now();
  const location = getLatestLocation() ?? undefined;
  const battery = await getBatteryPercent();

  const payload = {
    sosId,
    tripId: o.tripId,
    trigger: o.trigger,
    duress: false,
    location,
    battery,
    createdAt,
  };

  setSosState(sosId, getDefaultState());
  await upsertSosOutbox(sosId, JSON.stringify(payload), createdAt);
  ensureRetryLoop();

  const fallbackTimer = setTimeout(() => {
    const cur = _sosStates.get(sosId);
    if (cur && cur.status === 'sending') {
      setSosState(sosId, { ...cur, smsFallbackReady: true });
    }
  }, 20_000);

  const cancelWaking = beginServerRequest();
  try {
    const res = await createSos(payload);
    clearTimeout(fallbackTimer);
    cancelWaking();
    reportServerSuccess();
    await markSosOutboxSent(sosId);
    setSosState(sosId, {
      status: res.status,
      deliveries: res.guardians.map((g) => ({
        guardianId: g.guardianId,
        channel: g.channel,
        status: g.status,
      })),
      viaRelay: false,
      smsFallbackReady: false,
    });
  } catch {
    cancelWaking();
    reportServerOffline();
    await bumpSosOutboxRetry(sosId, Date.now() + 2_000);
  }

  return { sosId };
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export function useSosStatus(sosId: string): {
  status: 'sending' | 'active' | 'acknowledged' | 'resolved' | 'cancelled';
  deliveries: { guardianId: string; channel: string; status: string }[];
  viaRelay: boolean;
} {
  const [state, setState] = useState<SosUiState>(() => _sosStates.get(sosId) ?? getDefaultState());

  useEffect(() => {
    if (!sosId) return;
    let set = _sosListeners.get(sosId);
    if (!set) {
      set = new Set();
      _sosListeners.set(sosId, set);
    }
    set.add(setState);
    setState(_sosStates.get(sosId) ?? getDefaultState());

    const poll = async () => {
      try {
        const res = await getSosStatus(sosId);
        reportServerSuccess();
        setSosState(sosId, {
          status: res.status,
          deliveries: res.deliveries.map((d) => ({
            guardianId: d.guardianId,
            channel: d.channel,
            status: d.status,
          })),
          viaRelay: res.source === 'ble_gateway',
          smsFallbackReady: false,
        });
      } catch {}
    };

    void poll();
    const interval = setInterval(() => void poll(), 5_000);

    return () => {
      clearInterval(interval);
      _sosListeners.get(sosId)?.delete(setState);
    };
  }, [sosId]);

  return {
    status: state.status,
    deliveries: state.deliveries,
    viaRelay: state.viaRelay,
  };
}

/**
 * Last-resort device SMS intent fallback (fixes v1.0 broken navigator.userAgent URL bug).
 */
export async function openDeviceSmsFallback(
  phones: string[],
  userName: string,
  trackingUrl?: string,
  rideInfo?: { plate: string; driverName?: string; provider?: string } | null
): Promise<boolean> {
  if (phones.length === 0) return false;
  const cleanPhone = phones[0].replace(/\s+/g, '');
  const loc = getLatestLocation();
  const link =
    trackingUrl ?? (loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : 'Location pending');
  const rideText = rideInfo ? ` Vehicle: ${rideInfo.plate} (${rideInfo.provider || 'Cab'}${rideInfo.driverName ? `, Driver: ${rideInfo.driverName}` : ''}).` : '';
  const body = `SafarSaathi EMERGENCY ALERT: ${userName} may need help. Live Map: ${link}.${rideText} If urgent call 112.`;
  const separator = Platform.OS === 'android' ? '?' : '&';
  const url = `sms:${cleanPhone}${separator}body=${encodeURIComponent(body)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) return false;
  await Linking.openURL(url);
  return true;
}

/**
 * Foreground Shake x3 detector (FR-06, Section 12.3).
 */
export function useShakeSosTrigger(enabled: boolean, onShakeTriggered: () => void): void {
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let shakeTimestamps: number[] = [];
    let lastSpikeMs = 0;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      try {
        if (!Accelerometer || typeof Accelerometer.isAvailableAsync !== 'function') return;
        const available = await Accelerometer.isAvailableAsync().catch(() => false);
        if (!available || !isMounted) return;

        if (typeof Accelerometer.addListener === 'function') {
          Accelerometer.setUpdateInterval(150);
          sub = Accelerometer.addListener(({ x, y, z }) => {
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            const now = Date.now();
            if (magnitude > 2.3 && now - lastSpikeMs > 300) {
              lastSpikeMs = now;
              shakeTimestamps = shakeTimestamps.filter((t) => now - t < 2500);
              shakeTimestamps.push(now);
              if (shakeTimestamps.length >= 3) {
                shakeTimestamps = [];
                onShakeTriggered();
              }
            }
          });
        }
      } catch (err) {
        console.warn('[useShakeSosTrigger] Accelerometer sensor not available:', err);
      }
    })();

    return () => {
      isMounted = false;
      sub?.remove();
    };
  }, [enabled, onShakeTriggered]);
}

