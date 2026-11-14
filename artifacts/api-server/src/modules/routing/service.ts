import type { RouteResponse, PlaceSearchResult } from './orsClient.js';
import { orsClient } from './orsClient.js';
import { quotaGuard } from './quota.js';
import { routeCacheService } from './cache.js';
import { logger } from '../../lib/logger.js';

export interface RouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

/**
 * Service for Routing, Geocoding, and Fallback Strategy (FR-03, FR-16)
 */
export class RoutingService {
  /**
   * FR-16: POST /routes - Route and ETA with cache and straight-line fallback
   */
  async getRoute(request: RouteRequest): Promise<RouteResponse> {
    // Validate coordinates
    const { origin, destination } = request;
    for (const point of [origin, destination]) {
      if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
        throw new Error('Invalid coordinates');
      }
    }

    // 1. Check route cache
    const cached = await routeCacheService.getCachedRoute(origin, destination);
    if (cached) {
      logger.debug({ origin, destination }, 'Route cache hit');
      return cached;
    }

    // 2. Check quota guard (soft cap at 90%)
    const canUseOrs = await quotaGuard.isQuotaAvailable();
    if (!canUseOrs) {
      logger.info({ origin, destination }, 'ORS quota exceeded, using straight-line fallback');
      return this.calculateStraightLineRoute(origin, destination);
    }

    // 3. Fetch from OpenRouteService
    try {
      const route = await orsClient.fetchRoute(origin, destination);
      await quotaGuard.incrementUsage();
      await routeCacheService.setCachedRoute(origin, destination, route);
      logger.info({ origin, destination, source: 'ors' }, 'Route fetched from ORS');
      return route;
    } catch (err) {
      logger.warn({ err, origin, destination }, 'ORS fetch failed, using straight-line fallback');
      return this.calculateStraightLineRoute(origin, destination);
    }
  }

  /**
   * FR-10: GET /places/search - Place search with debounce
   */
  async searchPlaces(query: string, lat?: number, lng?: number): Promise<PlaceSearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }
    try {
      const results = await orsClient.searchPlaces(query, lat, lng);
      logger.debug({ query, lat, lng, count: results.length }, 'Place search completed');
      return results;
    } catch (err) {
      logger.warn({ err, query }, 'Place search failed');
      return [];
    }
  }

  /**
   * Free-tier straight-line fallback calculation using Haversine formula
   * Source is clearly marked as 'straight_line' in response
   */
  private calculateStraightLineRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): RouteResponse {
    const R = 6371000; // Earth radius in meters
    const lat1 = (origin.lat * Math.PI) / 180;
    const lat2 = (destination.lat * Math.PI) / 180;
    const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
    const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;

    // Haversine formula: a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceM = R * c;

    // Estimate duration at 25 km/h average urban speed (clearly approximate)
    const speedMps = 25000 / 3600; // 25 km/h in m/s
    const durationSec = Math.round(distanceM / speedMps);

    // For straight-line, polyline is just the two points (not a real road polyline)
    const polyline = JSON.stringify([
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ]);

    return {
      polyline,
      durationSec,
      distanceM: Math.round(distanceM),
      source: 'straight_line', // Clearly marked as fallback
    };
  }
}

export const routingService = new RoutingService();

