import { haversineKm, type LatLng } from './geo';

export type RiskLevel = 'safe' | 'warning' | 'danger';

export interface RiskInput {
  routeDeviation: boolean;
  unusualStop: boolean;
  noResponse: boolean;
  unsafeZone: boolean;
}

export interface RiskOutput {
  score: number;
  level: RiskLevel;
  triggers: string[];
}

export interface RiskZoneCircle {
  lat: number;
  lng: number;
  radiusM: number;
  severity: 'low' | 'medium' | 'high';
}

export interface RiskSample extends LatLng {
  ts: number;
  mocked?: boolean;
}

export interface RiskTrackerConfig {
  deviationThresholdKm?: number;
  deviationSustainedMs?: number;
  stopThresholdKm?: number;
  stopTimeMs?: number;
  alertCooldownMs?: number;
}

const WEIGHTS = {
  deviation: 30,
  stop: 25,
  unsafeZone: 20,
  noResponse: 40,
} as const;

const DANGER_THRESHOLD = 61;
const WARNING_THRESHOLD = 31;

export const DEVIATION_THRESHOLD_KM = 0.3;
export const DEVIATION_SUSTAINED_MS = 30_000;
export const STOP_THRESHOLD_KM = 0.05;
export const STOP_TIME_MS = 5 * 60 * 1000;
export const ALERT_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Pure rule-based risk score calculation (ported from SafarSaathi 1.0).
 */
export function computeRisk(input: RiskInput): RiskOutput {
  const triggers: string[] = [];
  let score = 0;

  if (input.routeDeviation) {
    score += WEIGHTS.deviation;
    triggers.push('Route deviation detected');
  }
  if (input.unusualStop) {
    score += WEIGHTS.stop;
    triggers.push('Unusual stop detected');
  }
  if (input.unsafeZone) {
    score += WEIGHTS.unsafeZone;
    triggers.push('Entered unsafe zone');
  }
  if (input.noResponse) {
    score += WEIGHTS.noResponse;
    triggers.push('No response from user');
  }

  let level: RiskLevel = 'safe';
  if (score >= DANGER_THRESHOLD) level = 'danger';
  else if (score >= WARNING_THRESHOLD) level = 'warning';

  return { score, level, triggers };
}

/**
 * Distance from point P to line segment AB (in km).
 */
export function distanceFromSegmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const dAB = haversineKm(a, b);
  if (dAB < 0.001) {
    return haversineKm(a, p);
  }
  const denom = (b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2;
  if (denom === 0) return haversineKm(a, p);

  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.lat - a.lat) * (b.lat - a.lat) + (p.lng - a.lng) * (b.lng - a.lng)) / denom
    )
  );
  return haversineKm(p, {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  });
}

/**
 * Minimum distance from point to any segment of a route polyline (in km).
 */
export function distanceFromRouteKm(point: LatLng, route: LatLng[]): number {
  if (route.length < 2) return 0;
  let minDist = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceFromSegmentKm(point, route[i], route[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function isInUnsafeZone(point: LatLng, zones: RiskZoneCircle[]): boolean {
  for (const zone of zones) {
    if (zone.severity === 'low') continue;
    const distM = haversineKm(point, zone) * 1000;
    if (distM <= zone.radiusM) return true;
  }
  return false;
}

/**
 * Stateful time-driven risk tracker.
 * Fixes the v1.0 bug where stationary users stopped producing updates:
 * evaluates elapsed `sample.ts` continuously on every time-driven fix.
 */
export class RiskTracker {
  private readonly cfg: Required<RiskTrackerConfig>;
  private lastAnchor: RiskSample | null = null;
  private deviationStartTs: number | null = null;
  private lastAlertTs = 0;
  private noResponse = false;

  constructor(config: RiskTrackerConfig = {}) {
    this.cfg = {
      deviationThresholdKm: config.deviationThresholdKm ?? DEVIATION_THRESHOLD_KM,
      deviationSustainedMs: config.deviationSustainedMs ?? DEVIATION_SUSTAINED_MS,
      stopThresholdKm: config.stopThresholdKm ?? STOP_THRESHOLD_KM,
      stopTimeMs: config.stopTimeMs ?? STOP_TIME_MS,
      alertCooldownMs: config.alertCooldownMs ?? ALERT_COOLDOWN_MS,
    };
  }

  reset(): void {
    this.lastAnchor = null;
    this.deviationStartTs = null;
    this.lastAlertTs = 0;
    this.noResponse = false;
  }

  setNoResponse(flag: boolean): void {
    this.noResponse = flag;
  }

  evaluate(
    sample: RiskSample,
    route: LatLng[],
    zones: RiskZoneCircle[] = []
  ): RiskOutput & { shouldPrompt: boolean; flags: RiskInput } {
    // 1. Route deviation
    let routeDeviation = false;
    if (route.length >= 2) {
      const distKm = distanceFromRouteKm(sample, route);
      if (distKm > this.cfg.deviationThresholdKm) {
        if (this.deviationStartTs === null) this.deviationStartTs = sample.ts;
        routeDeviation = sample.ts - this.deviationStartTs >= this.cfg.deviationSustainedMs;
      } else {
        this.deviationStartTs = null;
      }
    }

    // 2. Unusual stop (time-driven check against last movement > stopThresholdKm)
    let unusualStop = false;
    if (this.lastAnchor === null) {
      this.lastAnchor = sample;
    } else {
      const movedKm = haversineKm(this.lastAnchor, sample);
      if (movedKm > this.cfg.stopThresholdKm) {
        this.lastAnchor = sample;
      } else if (sample.ts - this.lastAnchor.ts >= this.cfg.stopTimeMs) {
        unusualStop = true;
      }
    }

    // 3. Unsafe zone
    const unsafeZone = isInUnsafeZone(sample, zones);

    const flags: RiskInput = {
      routeDeviation,
      unusualStop,
      noResponse: this.noResponse,
      unsafeZone,
    };
    const output = computeRisk(flags);

    const shouldPrompt =
      (output.level === 'warning' || output.level === 'danger') &&
      sample.ts - this.lastAlertTs >= this.cfg.alertCooldownMs;

    if (shouldPrompt) {
      this.lastAlertTs = sample.ts;
    }

    return { ...output, shouldPrompt, flags };
  }
}

