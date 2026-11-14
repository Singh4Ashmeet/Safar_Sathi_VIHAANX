import { useEffect, useState } from 'react';
import { getRelayBundle, uploadRelayPackets, type RelayBundle } from '@workspace/api-client-react';
import {
  RelayEngine,
  SimMeshHub,
  SimTransport,
  base64ToBytes,
  buildPacket,
  bytesToBase64,
  hexToBytes,
  uuidToBytes,
  type MeshTransport,
} from '@workspace/safety-core';
import {
  ensureDeviceKeys,
  generateUuidV4,
  loadRelayBundleRaw,
  randomNonce24,
  saveRelayBundleRaw,
} from './secure';

export interface RelayStatus {
  enabled: boolean;
  peers: number;
  queued: number;
  uploaded: number;
  transport: 'sim' | 'beacon';
}

const simHub = new SimMeshHub();
const simTransport = new SimTransport('self', simHub);
const relayEngine = new RelayEngine();

let _activeTransport: MeshTransport = simTransport;
let _transportMode: 'sim' | 'beacon' = 'sim';
let _enabled = false;
let _uploadedCount = 0;
let _cachedBundle: RelayBundle | null = null;
const _listeners = new Set<(s: RelayStatus) => void>();

function getSnapshot(): RelayStatus {
  return {
    enabled: _enabled,
    peers: _activeTransport.peers().length,
    queued: relayEngine.getQueuedCount(),
    uploaded: _uploadedCount,
    transport: _transportMode,
  };
}

function emit(): void {
  const snap = getSnapshot();
  _listeners.forEach((fn) => fn(snap));
}

_activeTransport.onPacket((raw, peerId) => {
  if (!_enabled) return;
  const decision = relayEngine.ingest(raw, peerId);
  if (decision.accepted) {
    emit();
    setTimeout(() => {
      for (const neighbor of _activeTransport.peers()) {
        if (neighbor !== peerId) {
          void _activeTransport.send(decision.packet.raw, neighbor);
        }
      }
    }, decision.forwardDelayMs);
  }
});

export async function syncRelayBundle(): Promise<RelayBundle | null> {
  try {
    const bundle = await getRelayBundle();
    _cachedBundle = bundle;
    await saveRelayBundleRaw(JSON.stringify(bundle));
    return bundle;
  } catch {
    if (!_cachedBundle) {
      const raw = await loadRelayBundleRaw();
      if (raw) {
        try {
          _cachedBundle = JSON.parse(raw) as RelayBundle;
        } catch {}
      }
    }
    return _cachedBundle;
  }
}

export async function broadcastOfflineSosPacket(params: {
  lat: number;
  lng: number;
  accuracyM?: number;
  battery?: number;
  duress?: boolean;
  sosId?: string;
}): Promise<boolean> {
  const bundle = _cachedBundle ?? (await syncRelayBundle());
  if (!bundle) return false;

  const keys = await ensureDeviceKeys();
  const nonce = await randomNonce24();
  const nowSec = Math.floor(Date.now() / 1000);
  const sosId = params.sosId ?? generateUuidV4();

  const raw = buildPacket({
    eventId: uuidToBytes(sosId),
    destTag: hexToBytes(bundle.destTagForGateway),
    createdAtSec: nowSec,
    epochDay: bundle.epoch,
    ttl: bundle.ttlStart,
    priority: 3,
    plaintext: {
      lat: params.lat,
      lng: params.lng,
      accuracyM: params.accuracyM ?? 20,
      locTs: nowSec,
      msgCode: 1,
      battery: params.battery ?? 100,
      duress: Boolean(params.duress),
    },
    serverBoxPublicKey: base64ToBytes(bundle.serverBoxPublicKey),
    senderSignPublicKey: base64ToBytes(keys.sign.publicKey),
    senderSignSecretKey: base64ToBytes(keys.sign.secretKey),
    nonce,
  });

  relayEngine.ingest(raw, null);
  emit();
  return _activeTransport.send(raw);
}

/**
 * Gateway upload with >= 2-minute retry window (Section 11.4 rule 4: covers Render cold start).
 */
export async function flushRelayUploads(): Promise<void> {
  const pending = relayEngine.getPendingForUpload();
  if (pending.length === 0) return;

  try {
    const res = await uploadRelayPackets({
      packets: pending.map((p) => ({
        b64: bytesToBase64(p.raw),
        receivedAt: p.receivedAtMs,
        hops: p.hops,
      })),
    });
    for (const item of res.results) {
      if (item.status === 'accepted' || item.status === 'duplicate') {
        relayEngine.markUploaded(item.eventId);
        _uploadedCount += 1;
      }
    }
    emit();
  } catch {
    // Retry will pick up on next cycle
  }
}

export function setCustomMeshTransport(transport: MeshTransport, mode: 'sim' | 'beacon'): void {
  _activeTransport = transport;
  _transportMode = mode;
  emit();
}

export function getSimMeshHub(): SimMeshHub {
  return simHub;
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export async function setEnabled(on: boolean): Promise<void> {
  _enabled = on;
  if (on) {
    await syncRelayBundle();
    await _activeTransport.start();
  } else {
    await _activeTransport.stop();
  }
  emit();
}

/**
 * Frozen B <-> C interface (Section 15.4).
 */
export function useRelayStatus(): {
  enabled: boolean;
  peers: number;
  queued: number;
  uploaded: number;
  transport: 'sim' | 'beacon';
} {
  const [status, setStatus] = useState<RelayStatus>(() => getSnapshot());

  useEffect(() => {
    setStatus(getSnapshot());
    _listeners.add(setStatus);
    return () => {
      _listeners.delete(setStatus);
    };
  }, []);

  return status;
}

