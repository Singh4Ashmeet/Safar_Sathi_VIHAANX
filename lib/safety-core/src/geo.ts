export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine distance in kilometers between two coordinates.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Decode Google / OpenRouteService encoded polyline (precision 1e5).
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  if (!encoded) return [];
  const factor = Math.pow(10, precision);
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ lat: lat / factor, lng: lng / factor });
  }
  return coords;
}

/**
 * Straight-line distance & conservative city-speed ETA fallback (FR-16).
 */
export function straightLineRouteFallback(
  origin: LatLng,
  destination: LatLng,
  avgSpeedKmh = 25
): { points: LatLng[]; distanceM: number; durationSec: number } {
  const distanceKm = haversineKm(origin, destination);
  const distanceM = Math.round(distanceKm * 1000);
  const durationSec = Math.max(60, Math.round((distanceKm / avgSpeedKmh) * 3600));
  return {
    points: [origin, destination],
    distanceM,
    durationSec,
  };
}

