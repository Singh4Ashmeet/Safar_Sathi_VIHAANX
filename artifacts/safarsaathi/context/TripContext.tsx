import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    setRiskContext(pts, []);
  }, []);

  const startProtectedTrip = useCallback(async (trip: Trip, pts: LatLng[]) => {
    setActiveTrip(trip);
    setRoutePoints(pts);
    setShareUrl(null);
    setRiskContext(pts, []);
    await trackingService.start(trip.id);
  }, []);

  const stopProtectedTrip = useCallback(async () => {
    await trackingService.stop();
    resetRiskTracker();
    setActiveTrip(null);
    setRoutePoints([]);
    setShareUrl(null);
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
