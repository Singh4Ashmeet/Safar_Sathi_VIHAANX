import { computeRoute } from '@workspace/api-client-react';
import { decodePolyline, straightLineRouteFallback, type LatLng } from '@workspace/safety-core';

export interface RouteResult {
  routePoints: LatLng[];
  polyline: string;
  distanceM: number;
  durationSec: number;
  directDistanceM: number;
  source: 'ors' | 'straight_line';
  isApproximate: boolean;
}

export function computeHaversineM(p1: LatLng, p2: LatLng): number {
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function snapAndConnectPoints(rawPoints: LatLng[], origin: LatLng, destination: LatLng): LatLng[] {
  if (rawPoints.length === 0) {
    return [origin, destination];
  }
  const result = [...rawPoints];
  // Ensure route connects directly from the user's origin
  if (computeHaversineM(origin, result[0]) > 8) {
    result.unshift(origin);
  } else {
    result[0] = origin;
  }
  // Ensure route connects directly to the final destination pin
  if (computeHaversineM(result[result.length - 1], destination) > 8) {
    result.push(destination);
  } else {
    result[result.length - 1] = destination;
  }
  return result;
}

/**
 * Calculates a verified road route between origin and destination via SafarSaathi backend ORS proxy.
 * Automatically falls back to public OSRM or straight-line estimation if offline.
 */
export async function fetchSafeRoute(
  origin: LatLng,
  destination: LatLng
): Promise<RouteResult> {
  const now = Date.now();
  const directDistanceM = computeHaversineM(origin, destination);

  // 1. Try primary backend ORS router
  try {
    const res = await computeRoute({
      origin: { lat: origin.lat, lng: origin.lng, ts: now },
      destination: { lat: destination.lat, lng: destination.lng, ts: now },
    });

    const decoded = decodePolyline(res.polyline);
    const connected = snapAndConnectPoints(
      decoded.length >= 2 ? decoded : [origin, destination],
      origin,
      destination
    );

    return {
      routePoints: connected,
      polyline: res.polyline,
      distanceM: Math.max(res.distanceM, directDistanceM),
      durationSec: res.durationSec,
      directDistanceM,
      source: (res as any).source === 'straight_line' ? 'straight_line' : 'ors',
      isApproximate: (res as any).source === 'straight_line',
    };
  } catch {
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
          const connected = snapAndConnectPoints(points, origin, destination);

          return {
            routePoints: connected,
            polyline: JSON.stringify(connected.map((p) => [p.lng, p.lat])),
            distanceM: Math.round(route.distance),
            durationSec: Math.round(route.duration),
            directDistanceM,
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
      routePoints: [origin, destination],
      polyline: '',
      distanceM: fallback.distanceM,
      durationSec: fallback.durationSec,
      directDistanceM,
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
