import { useEffect, useState } from 'react';
import {
  RiskTracker,
  type LatLng,
  type RiskLevel,
  type RiskSample,
  type RiskZoneCircle,
} from '@workspace/safety-core';

export interface RiskUiState {
  level: RiskLevel;
  score: number;
  triggers: string[];
}

const tracker = new RiskTracker();
let _route: LatLng[] = [];
let _zones: RiskZoneCircle[] = [];
let _state: RiskUiState = { level: 'safe', score: 0, triggers: [] };
const _listeners = new Set<(state: RiskUiState) => void>();

function emit(next: RiskUiState): void {
  _state = next;
  _listeners.forEach((fn) => fn(_state));
}

export function setRiskContext(route: LatLng[], zones: RiskZoneCircle[] = []): void {
  _route = route;
  _zones = zones;
}

export function resetRiskTracker(): void {
  tracker.reset();
  emit({ level: 'safe', score: 0, triggers: [] });
}

export function evaluateRiskSample(sample: RiskSample): {
  level: RiskLevel;
  score: number;
  triggers: string[];
  shouldPrompt: boolean;
} {
  const result = tracker.evaluate(sample, _route, _zones);
  emit({ level: result.level, score: result.score, triggers: result.triggers });
  return result;
}

export function setNoResponseRisk(flag: boolean): void {
  tracker.setNoResponse(flag);
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export function useRiskState(): { level: 'safe' | 'warning' | 'danger'; score: number; triggers: string[] } {
  const [state, setState] = useState<RiskUiState>(_state);

  useEffect(() => {
    setState(_state);
    _listeners.add(setState);
    return () => {
      _listeners.delete(setState);
    };
  }, []);

  return state;
}

