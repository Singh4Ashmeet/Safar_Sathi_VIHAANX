import { useEffect, useState } from 'react';

export type ServerConnectivityState = 'ok' | 'waking' | 'offline';

export interface ServerStatus {
  state: ServerConnectivityState;
  since: number;
}

export type NetworkMode = 'internet' | 'ble' | 'offline';

export interface ConnectivityModeInfo {
  mode: NetworkMode;
  isInternetOnline: boolean;
  serverState: ServerConnectivityState;
  isWaking: boolean;
  lastCheckedAt: number;
}

const WAKING_THRESHOLD_MS = 5_000;
const PROBE_INTERVAL_MS = 10_000;

let _status: ServerStatus = { state: 'ok', since: Date.now() };
let _isInternetOnline = true;
let _lastCheckedAt = Date.now();
let _pendingStartedAt: number | null = null;
let _wakingTimer: ReturnType<typeof setTimeout> | null = null;
let _probeTimer: ReturnType<typeof setInterval> | null = null;

const _serverListeners = new Set<(status: ServerStatus) => void>();
const _connectivityListeners = new Set<(info: ConnectivityModeInfo) => void>();

function notifyServerListeners(): void {
  _serverListeners.forEach((fn) => fn(_status));
}

function notifyConnectivityListeners(): void {
  const info: ConnectivityModeInfo = {
    mode: _isInternetOnline ? 'internet' : 'offline',
    isInternetOnline: _isInternetOnline,
    serverState: _status.state,
    isWaking: _status.state === 'waking',
    lastCheckedAt: _lastCheckedAt,
  };
  _connectivityListeners.forEach((fn) => fn(info));
}

function emitServer(next: ServerStatus): void {
  if (_status.state === next.state && _status.since === next.since) return;
  _status = next;
  notifyServerListeners();
  notifyConnectivityListeners();
}

/**
 * Active lightweight probe to verify actual internet connectivity
 * Checks standard Android 204 captive portal generator, then Supabase CDN origin.
 */
export async function probeInternet(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const online = res.status === 204 || res.ok;
    _isInternetOnline = online;
    _lastCheckedAt = Date.now();
    notifyConnectivityListeners();
    return online;
  } catch {
    clearTimeout(timer);
    try {
      const fbController = new AbortController();
      const fbTimer = setTimeout(() => fbController.abort(), 3500);
      const fbRes = await fetch('https://xszzlffkphybdigeoiei.supabase.co', {
        method: 'HEAD',
        signal: fbController.signal,
      });
      clearTimeout(fbTimer);
      const online = fbRes.status >= 200 && fbRes.status < 500;
      _isInternetOnline = online;
      _lastCheckedAt = Date.now();
      notifyConnectivityListeners();
      return online;
    } catch {
      _isInternetOnline = false;
      _lastCheckedAt = Date.now();
      notifyConnectivityListeners();
      return false;
    }
  }
}

// Initial probe on module load
void probeInternet();

// Periodic background probe
if (!_probeTimer) {
  _probeTimer = setInterval(() => {
    void probeInternet();
  }, PROBE_INTERVAL_MS);
}

export function beginServerRequest(): () => void {
  if (_pendingStartedAt === null) {
    _pendingStartedAt = Date.now();
    _wakingTimer = setTimeout(() => {
      if (_pendingStartedAt !== null && _status.state !== 'offline') {
        emitServer({ state: 'waking', since: Date.now() });
      }
    }, WAKING_THRESHOLD_MS);
  }
  return () => {
    _pendingStartedAt = null;
    if (_wakingTimer) {
      clearTimeout(_wakingTimer);
      _wakingTimer = null;
    }
  };
}

export function reportServerSuccess(): void {
  _pendingStartedAt = null;
  if (_wakingTimer) {
    clearTimeout(_wakingTimer);
    _wakingTimer = null;
  }
  _isInternetOnline = true;
  _lastCheckedAt = Date.now();
  if (_status.state !== 'ok') {
    emitServer({ state: 'ok', since: Date.now() });
  } else {
    notifyConnectivityListeners();
  }
}

export function reportServerOffline(): void {
  _pendingStartedAt = null;
  if (_wakingTimer) {
    clearTimeout(_wakingTimer);
    _wakingTimer = null;
  }
  // Check actual internet reachability before stamping total offline
  void probeInternet().then((isOnline) => {
    if (!isOnline && _status.state !== 'offline') {
      emitServer({ state: 'offline', since: Date.now() });
    } else {
      notifyConnectivityListeners();
    }
  });
}

export function reportServerWaking(): void {
  if (_status.state !== 'waking') {
    emitServer({ state: 'waking', since: Date.now() });
  }
}

export function getServerStatus(): ServerStatus {
  return _status;
}

export function getIsInternetOnline(): boolean {
  return _isInternetOnline;
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export function useServerStatus(): { state: 'ok' | 'waking' | 'offline'; since: number } {
  const [status, setStatus] = useState<ServerStatus>(_status);

  useEffect(() => {
    setStatus(_status);
    _serverListeners.add(setStatus);
    return () => {
      _serverListeners.delete(setStatus);
    };
  }, []);

  return status;
}

/**
 * Real-time reactive connectivity mode hook.
 * Tells whether the device is in Internet, BLE Relay, or Offline mode.
 */
export function useConnectivityMode(): ConnectivityModeInfo {
  const [info, setInfo] = useState<ConnectivityModeInfo>({
    mode: _isInternetOnline ? 'internet' : 'offline',
    isInternetOnline: _isInternetOnline,
    serverState: _status.state,
    isWaking: _status.state === 'waking',
    lastCheckedAt: _lastCheckedAt,
  });

  useEffect(() => {
    setInfo({
      mode: _isInternetOnline ? 'internet' : 'offline',
      isInternetOnline: _isInternetOnline,
      serverState: _status.state,
      isWaking: _status.state === 'waking',
      lastCheckedAt: _lastCheckedAt,
    });
    _connectivityListeners.add(setInfo);
    return () => {
      _connectivityListeners.delete(setInfo);
    };
  }, []);

  return info;
}


