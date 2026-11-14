import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { LatLng } from '@workspace/safety-core';
import type { Trip } from '@workspace/api-client-react';
import * as trackingService from '@/services/tracking';
import * as sosService from '@/services/sos';
import { setRiskContext, resetRiskTracker } from '@/services/risk';

const DISCREET_MODE_STORAGE_KEY = '@safarsaathi_discreet_mode';

export interface ActiveRideDetails {
  plate: string;
  driverName?: string;
  provider?: string;
}

interface TripContextValue {
  activeTrip: Trip | null;
  activeRide: ActiveRideDetails | null;
  routePoints: LatLng[];
  activeSosId: string | null;
  activeWatchId: string | null;
  shareUrl: string | null;
  discreetMode: boolean;
  nightTheme: boolean;
  nextSafetyCheck: number;
  pendingSafetyCheck: number | null;
  setActiveRide: (ride: ActiveRideDetails | null) => void;
  setActiveTripSession: (trip: Trip | null, routePoints?: LatLng[], ride?: ActiveRideDetails | null) => void;
  setActiveSosId: (sosId: string | null) => void;
  setActiveWatchId: (watchId: string | null) => void;
  setShareUrl: (url: string | null) => void;
  setDiscreetMode: (on: boolean) => void;
  toggleDiscreetMode: () => void;
  setNightTheme: (on: boolean) => void;
  startProtectedTrip: (trip: Trip, routePoints: LatLng[], ride?: ActiveRideDetails | null) => Promise<void>;
  stopProtectedTrip: () => Promise<void>;
  confirmSafetyCheck: () => void;
  triggerSosFlow: (trigger: 'button' | 'shake' | 'prompt_timeout') => Promise<string>;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [activeRide, setActiveRide] = useState<ActiveRideDetails | null>(null);
  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [discreetMode, setDiscreetModeState] = useState(false);
  const [nightTheme, setNightTheme] = useState(false);
  const [nextSafetyCheck, setNextSafetyCheck] = useState(1);
  const [pendingSafetyCheck, setPendingSafetyCheck] = useState<number | null>(null);
  const [lastCheckConfirmedAt, setLastCheckConfirmedAt] = useState<number>(0);

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

  const setActiveTripSession = useCallback((trip: Trip | null, pts: LatLng[] = [], ride?: ActiveRideDetails | null) => {
    setActiveTrip(trip);
    if (ride !== undefined) setActiveRide(ride);
    setRoutePoints(pts);
    setNextSafetyCheck(1);
    setPendingSafetyCheck(null);
    setLastCheckConfirmedAt(0);
    setRiskContext(pts, []);
  }, []);

  const startProtectedTrip = useCallback(async (trip: Trip, pts: LatLng[], ride?: ActiveRideDetails | null) => {
    setActiveTrip(trip);
    if (ride !== undefined) setActiveRide(ride);
    setRoutePoints(pts);
    setShareUrl(null);
    setNextSafetyCheck(1);
    setPendingSafetyCheck(null);
    setLastCheckConfirmedAt(0);
    setRiskContext(pts, []);
    await trackingService.start(trip.id);
  }, []);

  const stopProtectedTrip = useCallback(async () => {
    await trackingService.stop();
    resetRiskTracker();
    setActiveTrip(null);
    setActiveRide(null);
    setRoutePoints([]);
    setShareUrl(null);
    setPendingSafetyCheck(null);
    setNextSafetyCheck(1);
    setLastCheckConfirmedAt(0);
  }, []);

  // Divide the planned ride duration into spaced safety-check intervals.
  // Minimum interval of 2 minutes ensures the user is never spammed back-to-back.
  // If a check was recently confirmed, the next check is scheduled after the full interval.
  useEffect(() => {
    if (!activeTrip || pendingSafetyCheck !== null || nextSafetyCheck > 6) return;
    if (!activeTrip.etaAt || activeTrip.etaAt <= activeTrip.startedAt) return;

    const totalDuration = Math.max(180_000, activeTrip.etaAt - activeTrip.startedAt);
    const intervalMs = Math.max(120_000, Math.floor(totalDuration / 6));

    const baseTime = lastCheckConfirmedAt > 0 ? lastCheckConfirmedAt : activeTrip.startedAt;
    const dueAt = baseTime + intervalMs;
    const delay = Math.max(30_000, dueAt - Date.now());

    const timeout = setTimeout(() => {
      if (!activeTrip) return;
      setPendingSafetyCheck(nextSafetyCheck);
      router.push({ pathname: '/prompt', params: { check: String(nextSafetyCheck) } });
    }, delay);

    return () => clearTimeout(timeout);
  }, [activeTrip, nextSafetyCheck, pendingSafetyCheck, lastCheckConfirmedAt]);

  const confirmSafetyCheck = useCallback(() => {
    setNextSafetyCheck((current) => current + 1);
    setPendingSafetyCheck(null);
    setLastCheckConfirmedAt(Date.now());
  }, []);

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
        activeRide,
        routePoints,
        activeSosId,
        activeWatchId,
        shareUrl,
        discreetMode,
        nightTheme,
        nextSafetyCheck,
        pendingSafetyCheck,
        setActiveRide,
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
