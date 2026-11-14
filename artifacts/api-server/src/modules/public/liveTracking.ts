import EventEmitter from 'node:events';

export interface LocationBroadcastEvent {
  lastLat: number;
  lastLng: number;
  lastSeenAt: number;
  tripStatus: string;
  accuracyM?: number;
  userName?: string;
  isExpired?: boolean;
}

/**
 * High-performance in-memory pub/sub broadcaster for real-time guardian tracking.
 * Eliminates database polling overhead by pushing new GPS fixes directly to connected guardians.
 */
class TrackingBroadcaster extends EventEmitter {
  constructor() {
    super();
    // Allow up to 2000 simultaneous guardian tracking streams without Node warning
    this.setMaxListeners(2000);
  }

  /**
   * Broadcast a fresh location fix to all guardians tracking this SOS or Trip.
   */
  broadcast(targetId: string, event: LocationBroadcastEvent): void {
    if (!targetId) return;
    this.emit(`track:${targetId}`, event);
  }

  /**
   * Subscribe a guardian connection to live location updates for a specific target ID.
   */
  subscribe(targetId: string, callback: (event: LocationBroadcastEvent) => void): () => void {
    const channel = `track:${targetId}`;
    this.on(channel, callback);
    return () => {
      this.off(channel, callback);
    };
  }
}

export const trackingBroadcaster = new TrackingBroadcaster();

