import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface RouteResponse {
  polyline: string;
  durationSec: number;
  distanceM: number;
  source: 'ors' | 'cache' | 'straight_line';
}

export interface PlaceSearchResult {
  label: string;
  lat: number;
  lng: number;
}

/**
 * OpenRouteService free-tier client wrapper (TRD section 2, FR-16)
 * Caps: 2,000 directions / day, 1,000 geocoding / day.
 */
export class OrsClient {
  private readonly apiKey = env.ORS_API_KEY;
  private readonly baseUrl = 'https://api.openrouteservice.org/v2';

  async fetchRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<RouteResponse> {
    if (!this.apiKey) {
      throw new Error('ORS_API_KEY not configured');
    }

    const url = `${this.baseUrl}/directions/driving-car`;
    const body = {
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
      format: 'geojson',
      preference: 'recommended',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, 'ORS API error');
      throw new Error(`ORS API error: ${response.status}`);
    }

    const data = await response.json();

    // Parse GeoJSON response
    const coords = data.features?.[0]?.geometry?.coordinates;
    const summary = data.features?.[0]?.properties?.summary;

    if (!coords || !summary) {
      throw new Error('Invalid ORS response format');
    }

    // Convert coordinates to encoded polyline (simplified - just return coordinates as string)
    // In production, use a proper polyline encoding library
    const polyline = JSON.stringify(coords);

    return {
      polyline,
      durationSec: Math.round(summary.duration),
      distanceM: Math.round(summary.distance),
      source: 'ors',
    };
  }

  async searchPlaces(query: string, lat?: number, lng?: number): Promise<PlaceSearchResult[]> {
    if (!this.apiKey) {
      throw new Error('ORS_API_KEY not configured');
    }

    if (!query || query.length < 2) {
      return [];
    }

    const url = `${this.baseUrl}/geocode/search`;
    const params = new URLSearchParams({
      text: query,
      'boundary.country': 'IN', // Focus on India
    });

    if (lat !== undefined && lng !== undefined) {
      params.set('focus.point.lon', String(lng));
      params.set('focus.point.lat', String(lat));
    }

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        'Authorization': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, 'ORS geocoding error');
      throw new Error(`ORS geocoding error: ${response.status}`);
    }

    const data = await response.json();

    const results: PlaceSearchResult[] = [];
    for (const feature of data.features || []) {
      const coords = feature.geometry?.coordinates;
      const props = feature.properties;
      if (coords && props?.label) {
        results.push({
          label: props.label,
          lat: coords[1],
          lng: coords[0],
        });
      }
    }

    return results.slice(0, 10); // Limit results
  }
}

export const orsClient = new OrsClient();

