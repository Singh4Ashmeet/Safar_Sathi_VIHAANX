import { Platform } from 'react-native';
import {
  BeaconReassembler,
  fragmentPacket,
  type MeshTransport,
} from '@workspace/safety-core';

/**
 * Minimal runtime adapter shape for BLE scan + advertise native modules
 * (confirmed during the 6-hour BLE go/no-go spike, Section 11.5-11.6).
 */
export interface BleRadioAdapter {
  startScanning(
    onManufacturerData: (peerId: string, payload: Uint8Array) => void
  ): Promise<void>;
  stopScanning(): Promise<void>;
  advertiseManufacturerData(payload: Uint8Array): Promise<void>;
  stopAdvertising(): Promise<void>;
}

/**
 * Section 11.5 — Transport A (BeaconTransport):
 * Splits a 192-byte encrypted SOS packet into ~12 manufacturer-data fragments
 * and rotates advertising them while scanning and reassembling fragments from peers.
 * Requires no GATT server.
 */
export class BeaconTransport implements MeshTransport {
  private started = false;
  private readonly reassembler = new BeaconReassembler();
  private readonly seenPeers = new Map<string, number>();
  private listeners: Array<(raw: Uint8Array, peerId: string) => void> = [];
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private outgoingQueue: Uint8Array[] = [];
  private rotationIdx = 0;

  constructor(private readonly adapter: BleRadioAdapter) {}

  async start(): Promise<void> {
    if (this.started || Platform.OS !== 'android') return;
    this.started = true;

    await this.adapter.startScanning((peerId, data) => {
      this.seenPeers.set(peerId, Date.now());
      this.reassembler.pruneExpired(60_000);
      const assembled = this.reassembler.ingestFragment(data);
      if (assembled) {
        for (const cb of this.listeners) {
          cb(assembled, peerId);
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.outgoingQueue = [];
    await this.adapter.stopScanning().catch(() => undefined);
    await this.adapter.stopAdvertising().catch(() => undefined);
  }

  onPacket(cb: (raw: Uint8Array, peerId: string) => void): void {
    this.listeners.push(cb);
  }

  async send(raw: Uint8Array): Promise<boolean> {
    if (!this.started || Platform.OS !== 'android') return false;
    const fragments = fragmentPacket(raw);
    this.outgoingQueue = fragments;
    this.rotationIdx = 0;

    if (!this.rotationTimer) {
      this.rotationTimer = setInterval(() => {
        if (!this.started || this.outgoingQueue.length === 0) return;
        const frag = this.outgoingQueue[this.rotationIdx % this.outgoingQueue.length];
        this.rotationIdx += 1;
        void this.adapter.advertiseManufacturerData(frag).catch(() => undefined);
      }, 250);
    }
    return true;
  }

  peers(): string[] {
    const now = Date.now();
    const active: string[] = [];
    for (const [peerId, seenAt] of this.seenPeers.entries()) {
      if (now - seenAt < 30_000) active.push(peerId);
    }
    return active;
  }
}
