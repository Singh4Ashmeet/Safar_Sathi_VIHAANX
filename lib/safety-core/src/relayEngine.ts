import { decrementPacketTtl, parsePacket, type ParsedSosPacket } from './packetCodec';

export interface StoredRelayPacket {
  eventIdHex: string;
  raw: Uint8Array;
  priority: number;
  ttl: number;
  createdAtSec: number;
  receivedAtMs: number;
  fromPeerId: string | null;
  hops: number;
  uploaded: boolean;
}

export interface RelayEngineConfig {
  maxQueueSize?: number; // default 50 (Section 11.4 rule 3)
  maxAgeSec?: number; // default 86400 (24 h)
  seenTtlMs?: number; // default 86400_000 (24 h)
  maxEventsPerPeerPerMinute?: number; // rule 6
}

export type IngestDecision =
  | { accepted: true; packet: StoredRelayPacket; forwardDelayMs: number }
  | { accepted: false; reason: 'malformed' | 'duplicate' | 'expired' | 'ttl_zero' | 'rate_limited' };

/**
 * Transport-independent store-and-forward relay engine (Section 11.4).
 */
export class RelayEngine {
  private readonly cfg: Required<RelayEngineConfig>;
  private readonly seenCache = new Map<string, number>(); // eventIdHex -> seenAtMs
  private readonly queue = new Map<string, StoredRelayPacket>(); // eventIdHex -> packet
  private readonly peerRates = new Map<string, { windowStartMs: number; count: number }>();

  constructor(config: RelayEngineConfig = {}) {
    this.cfg = {
      maxQueueSize: config.maxQueueSize ?? 50,
      maxAgeSec: config.maxAgeSec ?? 86400,
      seenTtlMs: config.seenTtlMs ?? 86400_000,
      maxEventsPerPeerPerMinute: config.maxEventsPerPeerPerMinute ?? 20,
    };
  }

  ingest(
    raw: Uint8Array,
    fromPeerId: string | null,
    nowMs = Date.now(),
    hops = 0,
    randomFn: () => number = Math.random
  ): IngestDecision {
    this.pruneExpired(nowMs);

    // 1. Parse and validate structure
    let parsed: ParsedSosPacket;
    try {
      parsed = parsePacket(raw);
    } catch {
      return { accepted: false, reason: 'malformed' };
    }

    // 2. Drop if eventId in 24h seen-cache
    if (this.seenCache.has(parsed.eventIdHex)) {
      return { accepted: false, reason: 'duplicate' };
    }

    // 3. Rate-limit per neighbor per minute
    if (fromPeerId) {
      const rate = this.peerRates.get(fromPeerId);
      if (!rate || nowMs - rate.windowStartMs >= 60_000) {
        this.peerRates.set(fromPeerId, { windowStartMs: nowMs, count: 1 });
      } else {
        if (rate.count >= this.cfg.maxEventsPerPeerPerMinute) {
          return { accepted: false, reason: 'rate_limited' };
        }
        rate.count += 1;
      }
    }

    // 4. Drop if expired or ttl == 0
    const nowSec = Math.floor(nowMs / 1000);
    if (Math.abs(nowSec - parsed.createdAt) > this.cfg.maxAgeSec) {
      return { accepted: false, reason: 'expired' };
    }
    if (parsed.ttl === 0) {
      return { accepted: false, reason: 'ttl_zero' };
    }

    // Record in seen-cache & bound queue (evict oldest non-critical if full)
    this.seenCache.set(parsed.eventIdHex, nowMs);
    if (this.queue.size >= this.cfg.maxQueueSize) {
      this.evictOne();
    }

    const forwardedRaw = fromPeerId === null ? new Uint8Array(raw) : decrementPacketTtl(raw);
    const stored: StoredRelayPacket = {
      eventIdHex: parsed.eventIdHex,
      raw: forwardedRaw,
      priority: parsed.priority,
      ttl: forwardedRaw[forwardedRaw.length - 1],
      createdAtSec: parsed.createdAt,
      receivedAtMs: nowMs,
      fromPeerId,
      hops,
      uploaded: false,
    };
    this.queue.set(parsed.eventIdHex, stored);

    // 5. Random forward delay: 0-1 s critical (priority === 3), 1-5 s other
    const r = randomFn();
    const forwardDelayMs =
      parsed.priority === 3 ? Math.round(r * 1000) : Math.round(1000 + r * 4000);

    return { accepted: true, packet: stored, forwardDelayMs };
  }

  getPendingForUpload(): StoredRelayPacket[] {
    return Array.from(this.queue.values()).filter((p) => !p.uploaded);
  }

  markUploaded(eventIdHex: string): void {
    const item = this.queue.get(eventIdHex);
    if (item) {
      item.uploaded = true;
    }
  }

  getQueuedCount(): number {
    return this.queue.size;
  }

  getPendingUploadCount(): number {
    let n = 0;
    for (const p of this.queue.values()) {
      if (!p.uploaded) n++;
    }
    return n;
  }

  getAllQueued(): StoredRelayPacket[] {
    return Array.from(this.queue.values());
  }

  private evictOne(): void {
    let victimKey: string | null = null;
    for (const [k, v] of this.queue.entries()) {
      if (v.priority < 3) {
        victimKey = k;
        break;
      }
    }
    if (!victimKey) {
      victimKey = this.queue.keys().next().value ?? null;
    }
    if (victimKey) {
      this.queue.delete(victimKey);
    }
  }

  private pruneExpired(nowMs: number): void {
    for (const [k, seenAt] of this.seenCache.entries()) {
      if (nowMs - seenAt > this.cfg.seenTtlMs) {
        this.seenCache.delete(k);
      }
    }
    const nowSec = Math.floor(nowMs / 1000);
    for (const [k, pkt] of this.queue.entries()) {
      if (Math.abs(nowSec - pkt.createdAtSec) > this.cfg.maxAgeSec) {
        this.queue.delete(k);
      }
    }
  }
}

