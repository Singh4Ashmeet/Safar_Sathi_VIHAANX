/**
 * Section 11.5 — Transport abstraction + SimTransport for unit tests and mesh visualiser.
 */

export interface MeshTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPacket(cb: (raw: Uint8Array, peerId: string) => void): void;
  send(raw: Uint8Array, peerId?: string): Promise<boolean>; // no peerId = broadcast
  peers(): string[];
}

export class SimMeshHub {
  private readonly nodes = new Map<string, SimTransport>();
  private readonly edges = new Map<string, Set<string>>();

  register(node: SimTransport): void {
    this.nodes.set(node.nodeId, node);
    if (!this.edges.has(node.nodeId)) {
      this.edges.set(node.nodeId, new Set());
    }
  }

  connect(a: string, b: string): void {
    if (!this.edges.has(a)) this.edges.set(a, new Set());
    if (!this.edges.has(b)) this.edges.set(b, new Set());
    this.edges.get(a)!.add(b);
    this.edges.get(b)!.add(a);
  }

  disconnect(a: string, b: string): void {
    this.edges.get(a)?.delete(b);
    this.edges.get(b)?.delete(a);
  }

  getNeighbors(nodeId: string): string[] {
    return Array.from(this.edges.get(nodeId) ?? []);
  }

  deliver(fromId: string, raw: Uint8Array, targetPeerId?: string): boolean {
    const neighbors = this.edges.get(fromId);
    if (!neighbors) return false;

    const recipients = targetPeerId
      ? neighbors.has(targetPeerId)
        ? [targetPeerId]
        : []
      : Array.from(neighbors);

    let delivered = false;
    for (const rid of recipients) {
      const target = this.nodes.get(rid);
      if (target && target.isStarted()) {
        target.receive(raw, fromId);
        delivered = true;
      }
    }
    return delivered;
  }
}

export class SimTransport implements MeshTransport {
  private started = false;
  private listeners: Array<(raw: Uint8Array, peerId: string) => void> = [];

  constructor(
    public readonly nodeId: string,
    private readonly hub: SimMeshHub
  ) {
    this.hub.register(this);
  }

  isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  onPacket(cb: (raw: Uint8Array, peerId: string) => void): void {
    this.listeners.push(cb);
  }

  receive(raw: Uint8Array, fromPeerId: string): void {
    const copy = new Uint8Array(raw);
    for (const cb of this.listeners) {
      cb(copy, fromPeerId);
    }
  }

  async send(raw: Uint8Array, peerId?: string): Promise<boolean> {
    if (!this.started) return false;
    return this.hub.deliver(this.nodeId, raw, peerId);
  }

  peers(): string[] {
    return this.hub.getNeighbors(this.nodeId);
  }
}

