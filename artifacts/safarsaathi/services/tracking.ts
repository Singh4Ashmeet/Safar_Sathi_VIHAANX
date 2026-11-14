import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ingestTripLocations, ingestSosLocations } from '@workspace/api-client-react';
import {
  beginServerRequest,
  reportServerOffline,
  reportServerSuccess,
} from './connectivity';
import {
  countPendingLocationPoints,
  deleteLocationRows,
  enqueueLocationPoint,
  getActiveTripId,
  readLocationBatch,
  setActiveTripId,
} from './outbox';
import { evaluateRiskSample, resetRiskTracker } from './risk';

export const LOCATION_TASK_NAME = 'SAFARSAATHI_LOCATION';

export interface TrackingStatus {
  running: boolean;
  lastFixAt?: number;
  pendingPoints: number;
  online: boolean;
}

let _status: TrackingStatus = {
  running: false,
  lastFixAt: undefined,
  pendingPoints: 0,
  online: true,
};
let _latestLocation: { lat: number; lng: number; acc?: number; ts: number; mocked?: boolean } | null =
  null;
let _flushing = false;
let _flushTimer: ReturnType<typeof setInterval> | null = null;
const _listeners = new Set<(s: TrackingStatus) => void>();

function emit(patch: Partial<TrackingStatus>): void {
  _status = { ..._status, ...patch };
  _listeners.forEach((fn) => fn(_status));
}

export function getLatestLocation(): {
  lat: number;
  lng: number;
  acc?: number;
  ts: number;
  mocked?: boolean;
} | null {
  return _latestLocation;
}

export async function flushOutbox(tripIdOverride?: string): Promise<void> {
  if (_flushing) return;
  _flushing = true;
  try {
    const tripId = tripIdOverride ?? (await getActiveTripId());
    if (!tripId) return;

    const batch = await readLocationBatch(tripId, 50);
    if (batch.length === 0) {
      emit({ pendingPoints: 0 });
      return;
    }

    const cancelWaking = beginServerRequest();
    try {
      await ingestTripLocations(tripId, {
        points: batch.map((row) => ({
          lat: row.lat,
          lng: row.lng,
          acc: row.acc ?? undefined,
          ts: row.ts,
          mocked: row.mocked === 1,
        })),
      });
      cancelWaking();
      reportServerSuccess();
      await deleteLocationRows(batch.map((r) => r.id));
      const remaining = await countPendingLocationPoints(tripId);
      emit({ pendingPoints: remaining, online: true });
    } catch {
      cancelWaking();
      reportServerOffline();
      const remaining = await countPendingLocationPoints(tripId);
      emit({ pendingPoints: remaining, online: false });
    }
  } finally {
    _flushing = false;
  }
}

// Register background location TaskManager handler at module top level (required by Expo)
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations || locations.length === 0) return;

    const tripId = await getActiveTripId();
    if (!tripId) return;

    for (const loc of locations) {
      const point = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        acc: loc.coords.accuracy ?? undefined,
        ts: Math.round(loc.timestamp || Date.now()),
        mocked: Boolean((loc as unknown as { mocked?: boolean }).mocked),
      };
      _latestLocation = point;
      await enqueueLocationPoint(tripId, point);
      evaluateRiskSample(point);
      emit({ lastFixAt: point.ts });
    }

    const pending = await countPendingLocationPoints(tripId);
    emit({ pendingPoints: pending });
    await flushOutbox(tripId);
  });
}

/**
 * Frozen B <-> C interface (Section 15.4).
 * Uses timeInterval: 15000 + distanceInterval: 0 (fixes the v1.0 stationary stop bug).
 */
export async function start(tripId: string): Promise<void> {
  resetRiskTracker();
  await setActiveTripId(tripId);

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission denied');
  }
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
    () => false
  );
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => undefined);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 0,
    deferredUpdatesInterval: 15_000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'SafarSaathi',
      notificationBody: 'Reminder',
      notificationColor: '#1E3A8A',
    },
  });

  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(() => {
    void flushOutbox();
  }, 15_000);

  emit({ running: true, lastFixAt: Date.now() });
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export async function stop(): Promise<void> {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  const activeTripId = await getActiveTripId();
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
    () => false
  );
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => undefined);
  }
  if (activeTripId) {
    await flushOutbox(activeTripId);
  }
  await setActiveTripId(null);
  emit({ running: false });
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export function useTrackingStatus(): {
  running: boolean;
  lastFixAt?: number;
  pendingPoints: number;
  online: boolean;
} {
  const [status, setStatus] = useState<TrackingStatus>(_status);

  useEffect(() => {
    setStatus(_status);
    _listeners.add(setStatus);
    return () => {
      _listeners.delete(setStatus);
    };
  }, []);

  return status;
}

let _sosLocationSub: Location.LocationSubscription | null = null;
let _activeStreamingSosId: string | null = null;

/**
 * Start high-frequency real-time location streaming during an active emergency SOS.
 * Continuously pushes GPS fixes every 4 seconds to POST /sos/:id/locations.
 */
export async function startSosLocationTracking(sosId: string): Promise<void> {
  if (_activeStreamingSosId === sosId && _sosLocationSub) return;
  _activeStreamingSosId = sosId;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
    if (status !== 'granted') return;

    if (_sosLocationSub) {
      _sosLocationSub.remove();
      _sosLocationSub = null;
    }

    // Immediate initial fix
    const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
    if (initial) {
      const point = {
        lat: initial.coords.latitude,
        lng: initial.coords.longitude,
        acc: initial.coords.accuracy ?? undefined,
        ts: Math.round(initial.timestamp || Date.now()),
      };
      _latestLocation = point;
      emit({ lastFixAt: point.ts });
      void ingestSosLocations(sosId, { points: [point] }).catch(() => undefined);
    }

    // High frequency 4-second watch
    _sosLocationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 5,
      },
      (loc) => {
        const point = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          acc: loc.coords.accuracy ?? undefined,
          ts: Math.round(loc.timestamp || Date.now()),
        };
        _latestLocation = point;
        emit({ lastFixAt: point.ts });
        void ingestSosLocations(sosId, { points: [point] }).catch(() => undefined);
      }
    );
  } catch (err) {
    console.warn('[TrackingService] Failed to start SOS location tracking:', err);
  }
}

/**
 * Stop emergency SOS high-frequency location streaming.
 */
export function stopSosLocationTracking(): void {
  _activeStreamingSosId = null;
  if (_sosLocationSub) {
    _sosLocationSub.remove();
    _sosLocationSub = null;
  }
}

