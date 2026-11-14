import { Platform, UIManager } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { LatLng } from '@workspace/safety-core';
import Colors from '@/constants/colors';

export const OPENFREEMAP_LIBERTY_STYLE =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

export const MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';

export interface MapZone {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  severity: 'low' | 'medium' | 'high';
  category: string;
}

export interface MapReport {
  id: string;
  lat: number;
  lng: number;
  category: string;
  note?: string;
  createdAt?: number;
}

/**
 * Validates if native MapLibre binaries are linked in the current runtime environment.
 * Evaluates to false inside stock Expo Go to prevent unhandled invariant crashes.
 */
export function isNativeMapSupported(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    if (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ) {
      return false;
    }
    return Boolean(
      UIManager.getViewManagerConfig &&
        UIManager.getViewManagerConfig('MLRNMapView') &&
        UIManager.getViewManagerConfig('MLRNCamera')
    );
  } catch {
    return false;
  }
}

/**
 * Lazy loads the MapLibre React Native module safely without crashing on unsupported runtimes.
 */
export function getNativeMapLibre(): any | null {
  if (!isNativeMapSupported()) return null;
  try {
    return require('@maplibre/maplibre-react-native');
  } catch {
    return null;
  }
}

/**
 * Convert safety zone models to a GeoJSON FeatureCollection with styling metadata
 */
export function zonesToGeoJson(zones: MapZone[]): any | null {
  if (zones.length === 0) return null;
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((z) => ({
      type: 'Feature' as const,
      id: z.id,
      properties: {
        id: z.id,
        severity: z.severity,
        category: z.category,
        color:
          z.severity === 'high'
            ? Colors.danger
            : z.severity === 'medium'
              ? Colors.warning
              : Colors.safe,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [z.lng, z.lat],
      },
    })),
  };
}

/**
 * Calculate camera center and zoom bounds to frame multiple coordinates
 */
export function calculateBounds(points: LatLng[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  center: LatLng;
} | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
  };
}

