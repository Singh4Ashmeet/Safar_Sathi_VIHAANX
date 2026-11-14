import * as Location from 'expo-location';
import type { LatLng } from '@workspace/safety-core';

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  isStale: boolean;
}

export interface PermissionStatus {
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  canAskAgain: boolean;
}

/**
 * Check and request foreground GPS permissions
 */
export async function requestForegroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('[LocationService] Foreground permission check error:', err);
    return false;
  }
}

/**
 * Check and request background GPS permissions (only for active safe trips)
 */
export async function requestBackgroundLocation(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return false;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch (err) {
    console.warn('[LocationService] Background permission error:', err);
    return false;
  }
}

/**
 * Fetch the latest current device GPS position
 */
export async function getCurrentFix(): Promise<LocationFix | null> {
  try {
    const hasFg = await requestForegroundLocation();
    if (!hasFg) return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const timestamp = loc.timestamp || Date.now();
    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      altitude: loc.coords.altitude ?? undefined,
      speed: loc.coords.speed ?? undefined,
      heading: loc.coords.heading ?? undefined,
      timestamp,
      isStale: isCoordinateStale(timestamp),
    };
  } catch (err) {
    console.warn('[LocationService] Failed to obtain GPS fix:', err);
    return null;
  }
}

export const getCurrentLocation = getCurrentFix;

/**
 * Returns true if the coordinate fix is older than maxAgeMs (default: 60s)
 */
export function isCoordinateStale(timestamp: number, maxAgeMs = 60_000): boolean {
  if (!timestamp || timestamp <= 0) return true;
  return Date.now() - timestamp > maxAgeMs;
}

/**
 * Human-readable relative time formatter (e.g. "Live now", "12s ago", "2m ago")
 */
export function formatFixFreshness(timestamp?: number): string {
  if (!timestamp) return 'No GPS fix';
  const sec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (sec < 5) return 'Live now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago (stale)`;
}

/**
 * Format GPS accuracy radius
 */
export function formatAccuracy(accuracy?: number): string {
  if (accuracy === undefined || accuracy === null) return 'GPS lock';
  if (accuracy < 10) return `±${Math.round(accuracy)}m (high)`;
  if (accuracy < 30) return `±${Math.round(accuracy)}m (good)`;
  return `±${Math.round(accuracy)}m (approx)`;
}

/**
 * Watch real-time GPS position stream continuously.
 */
export function watchLiveLocation(
  onFix: (fix: LocationFix) => void,
  intervalMs = 2500
): () => void {
  let sub: Location.LocationSubscription | null = null;
  let cancelled = false;

  Location.requestForegroundPermissionsAsync().then(({ status }) => {
    if (status !== 'granted' || cancelled) return;

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: intervalMs,
        distanceInterval: 4,
      },
      (loc) => {
        if (cancelled) return;
        const timestamp = loc.timestamp || Date.now();
        onFix({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
          altitude: loc.coords.altitude ?? undefined,
          speed: loc.coords.speed ?? undefined,
          heading: loc.coords.heading ?? undefined,
          timestamp,
          isStale: false,
        });
      }
    ).then((s) => {
      if (cancelled) {
        s.remove();
      } else {
        sub = s;
      }
    }).catch(() => undefined);
  }).catch(() => undefined);

  return () => {
    cancelled = true;
    if (sub) {
      sub.remove();
      sub = null;
    }
  };
}

