import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { LatLng } from '@workspace/safety-core';
import type { Trip } from '@workspace/api-client-react';
import * as trackingService from '@/services/tracking';
import * as sosService from '@/services/sos';
import { setRiskContext, resetRiskTracker } from '@/services/risk';

const DISCREET_MODE_STORAGE_KEY = '@safarsaathi_discreet_mode';

interface TripContextValue {
  activeTrip: Trip | null;
  routePoints: LatLng[];
  activeSosId: string | null;
  activeWatchId: string | null;
  shareUrl: string | null;
  discreetMode: boolean;
  nightTheme: boolean;
  setActiveTripSession: (trip: Trip | null, routePoints?: LatLng[]) => void;
  setActiveSosId: (sosId: string | null) => void;
  setActiveWatchId: (watchId: string | null) => void;
  setShareUrl: (url: string | null) => void;
  setDiscreetMode: (on: boolean) => void;
  toggleDiscreetMode: () => void;
  setNightTheme: (on: boolean) => void;
  startProtectedTrip: (trip: Trip, routePoints: LatLng[]) => Promise<void>;
  stopProtectedTrip: () => Promise<void>;
  confirmSafetyCheck: () => void;
  triggerSosFlow: (trigger: 'button' | 'shake' | 'prompt_timeout') => Promise<string>;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [discreetMode, setDiscreetModeState] = useState(false);
  const [nightTheme, setNightTheme] = useState(false);
  const [nextSafetyCheck, setNextSafetyCheck] = useState(1);
  const [pendingSafetyCheck, setPendingSafetyCheck] = useState<number | null>(null);

  // Load persisted discreet mode preference on mount
  useEffect(() => {
    AsyncStorage.getItem(DISCREET_MODE_STORAGE_KEY)
      .then((val) => {
        if (val !== null) {
          setDiscreetModeState(val === 'true');
        }
      })
      .catch(() => undefined);
  }, []);

  const setDiscreetMode = useCallback((on: boolean) => {
    setDiscreetModeState(on);
    AsyncStorage.setItem(DISCREET_MODE_STORAGE_KEY, on ? 'true' : 'false').catch(() => undefined);
  }, []);

  const toggleDiscreetMode = useCallback(() => {
    setDiscreetModeState((prev) => {
      const next = !prev;
      AsyncStorage.setItem(DISCREET_MODE_STORAGE_KEY, next ? 'true' : 'false').catch(() => undefined);
      return next;
    });
  }, []);

  const setActiveTripSession = useCallback((trip: Trip | null, pts: LatLng[] = []) => {
    setActiveTrip(trip);
    setRoutePoints(pts);
    setNextSafetyCheck(1);
    setPendingSafetyCheck(null);
    setRiskContext(pts, []);
  }, []);

  const startProtectedTrip = useCallback(async (trip: Trip, pts: LatLng[]) => {
    setActiveTrip(trip);
    setRoutePoints(pts);
    setShareUrl(null);
    setNextSafetyCheck(1);
    setPendingSafetyCheck(null);
    setRiskContext(pts, []);
    await trackingService.start(trip.id);
  }, []);

  const stopProtectedTrip = useCallback(async () => {
    await trackingService.stop();
    resetRiskTracker();
    setActiveTrip(null);
    setRoutePoints([]);
    setShareUrl(null);
    setPendingSafetyCheck(null);
    setNextSafetyCheck(1);
  }, []);

  // Divide the planned ride duration into six equal safety-check intervals.
  // The prompt owns the two response windows (30s, then 10s); confirmation
  // advances to the following interval while the trip remains protected.
  useEffect(() => {
    if (!activeTrip || pendingSafetyCheck !== null || nextSafetyCheck > 6) return;
    if (!activeTrip.etaAt || activeTrip.etaAt <= activeTrip.startedAt) return;

    const intervalMs = (activeTrip.etaAt - activeTrip.startedAt) / 6;
    const dueAt = activeTrip.startedAt + intervalMs * nextSafetyCheck;
    const timeout = setTimeout(() => {
      setPendingSafetyCheck(nextSafetyCheck);
      // The timer is deliberately routed through the existing prompt screen;
      // its expiry continues through the unchanged SOS trigger flow.
      router.push({ pathname: '/prompt', params: { check: String(nextSafetyCheck) } });
    }, Math.max(0, dueAt - Date.now()));

    return () => clearTimeout(timeout);
  }, [activeTrip, nextSafetyCheck, pendingSafetyCheck]);

  const confirmSafetyCheck = useCallback(() => {
    if (pendingSafetyCheck === null) return;
    setNextSafetyCheck((current) => Math.max(current, pendingSafetyCheck + 1));
    setPendingSafetyCheck(null);
  }, [pendingSafetyCheck]);

  const handleSetActiveSosId = useCallback((sosId: string | null) => {
    setActiveSosId(sosId);
    if (!sosId) {
      trackingService.stopSosLocationTracking();
    }
  }, []);

  const triggerSosFlow = useCallback(
    async (trigger: 'button' | 'shake' | 'prompt_timeout'): Promise<string> => {
      const { sosId } = await sosService.trigger({
        trigger,
        tripId: activeTrip?.id,
      });
      setActiveSosId(sosId);
      void trackingService.startSosLocationTracking(sosId);
      return sosId;
    },
    [activeTrip?.id]
  );

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        routePoints,
        activeSosId,
        activeWatchId,
        shareUrl,
        discreetMode,
        nightTheme,
        setActiveTripSession,
        setActiveSosId: handleSetActiveSosId,
        setActiveWatchId,
        setShareUrl,
        setDiscreetMode,
        toggleDiscreetMode,
        setNightTheme,
        startProtectedTrip,
        stopProtectedTrip,
        confirmSafetyCheck,
        triggerSosFlow,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside TripProvider');
  return ctx;
}
