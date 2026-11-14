import { computeRoute } from '@workspace/api-client-react';
import { decodePolyline, straightLineRouteFallback, type LatLng } from '@workspace/safety-core';

export interface RouteResult {
  routePoints: LatLng[];
  polyline: string;
  distanceM: number;
  durationSec: number;
  source: 'ors' | 'straight_line';
  isApproximate: boolean;
}

/**
 * Calculates a verified road route between origin and destination via SafarSaathi backend ORS proxy.
 * Automatically falls back to straight-line estimation if offline or backend quota is exhausted.
 */
export async function fetchSafeRoute(
  origin: LatLng,
  destination: LatLng
): Promise<RouteResult> {
  const now = Date.now();
  // 1. Try primary backend ORS router
  try {
    const res = await computeRoute({
      origin: { lat: origin.lat, lng: origin.lng, ts: now },
      destination: { lat: destination.lat, lng: destination.lng, ts: now },
    });

    const decoded = decodePolyline(res.polyline);
    const points = decoded.length >= 2 ? decoded : [origin, destination];

    return {
      routePoints: points,
      polyline: res.polyline,
      distanceM: res.distanceM,
      durationSec: res.durationSec,
      source: (res as any).source === 'straight_line' ? 'straight_line' : 'ors',
      isApproximate: (res as any).source === 'straight_line',
    };
  } catch (err) {
    // 2. Fetch real road geometry from public OSRM router
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          const route = osrmData.routes[0];
          const coords: [number, number][] = route.geometry.coordinates;
          const points: LatLng[] = coords.map(([lng, lat]) => ({ lat, lng }));

          return {
            routePoints: points,
            polyline: JSON.stringify(coords),
            distanceM: Math.round(route.distance),
            durationSec: Math.round(route.duration),
            source: 'ors',
            isApproximate: false,
          };
        }
      }
    } catch {
      // Offline fallback
    }

    // 3. Mathematical straight-line fallback if totally offline
    const fallback = straightLineRouteFallback(origin, destination);
    return {
      routePoints: fallback.points,
      polyline: '',
      distanceM: fallback.distanceM,
      durationSec: fallback.durationSec,
      source: 'straight_line',
      isApproximate: true,
    };
  }
}

/**
 * Convert an array of LatLng to a GeoJSON LineString FeatureCollection
 */
export function routePointsToGeoJson(points: LatLng[]): any | null {
  if (points.length < 2) return null;
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: points.map((p) => [p.lng, p.lat]),
        },
      },
    ],
  };
}
