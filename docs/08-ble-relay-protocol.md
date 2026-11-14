# BLE SOS Relay Protocol

> **Title**: BLE SOS Relay Protocol, Packet Layout, Crypto & Transports  
> **Source Sections**: Section 11 (BLE SOS relay protocol, 11.1–11.7)  
> **Owner**: Dev C & Dev A  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 11. BLE SOS relay protocol

The relay is an application-level store-and-forward layer, not Bluetooth Mesh, and it already costs nothing: it uses open-source libraries and the phones' own radios. Two changes in this edition: the rotating sender tag from amendment A1 is folded into the packet layout, and gateway uploads retry long enough to cover a sleeping free host.

### 11.1 Key decisions

1. **The recipient is the authorised gateway (our server), not the guardian's phone.** Guardians are usually far away, so the packet's job is to reach any phone with internet (the gateway), which uploads the still-encrypted packet. The server decrypts and fans out to guardians. Per-guardian end-to-end encryption is a later upgrade.
2. **Pre-provisioning.** While online, the app downloads the relay bundle (server public key, epoch tag, policy). Without it the app cannot encrypt offline, so the relay toggle stays disabled until the bundle exists.
3. **Spam resistance** comes from signatures verified by the gateway plus relay-side rate limits (11.4), because an offline relay cannot judge legitimacy.
4. **Transport A (fragment beacons)** is the hackathon transport: it needs no GATT server (11.5).

---

### 11.2 Packet layout (version 1, about 192 bytes)

**Plaintext (17 bytes):** lat int32 (degrees $\times$ 1e7), lon int32, accuracyM u16, locTs u32 (seconds), msgCode u8, battery u8, duress u8. The duress bit is inside the ciphertext, so relays and observers never see it.

| Bytes | Field | Notes |
| :--- | :--- | :--- |
| 1 | `ver` | Protocol version = 1 |
| 1 | `flags` | bit0–1 priority (3 = critical); other bits reserved |
| 16 | `eventId` | Cryptographically random; equals `sosId` |
| 8 | `destTag` | Rotating tag; 'gateway' tag in v1 |
| 4 | `createdAt` | Unix seconds (u32) |
| 8 | `senderTag` | First 8 bytes of HMAC-SHA256(signPublicKey, epochDay). The gateway keeps an indexed table of today's and yesterday's tags for registered users, so observers cannot link a sender across days. The same epochDay is delivered in the relay bundle |
| 32 | `ephPub` | Ephemeral X25519 public key (sealed-box style) |
| 24 | `nonce` | Random |
| 33 | `ciphertext` | 17-byte plaintext plus 16-byte authentication tag |
| 64 | `signature` | Ed25519 over all fields above except ttl |
| 1 | `ttl` | Mutable, decremented by relays; excluded from the signature |

At a negotiated BLE MTU of 247 the packet fits in one write; for beacon transport it is split into about 12 fragments.

---

### 11.3 Cryptography

- **Encryption:** X25519 + XSalsa20-Poly1305 via `nacl.box` with a fresh ephemeral key per event (`tweetnacl`, free and audited).
- **Signature:** Ed25519 using the user's signing key (public key registered at `PUT /me`). Randomness from `expo-crypto`. Keys in `expo-secure-store`.
- **Gateway checks:** valid signature for a known senderTag, createdAt within the allowed window (default 24 h, tolerant of clock drift), eventId unseen, decryption succeeds.

---

### 11.4 Relay engine rules (in safety-core, transport-independent)

1. Parse and validate structure; drop malformed.
2. Drop if `eventId` is in the seen-cache (cache holds 24 h).
3. Drop if expired or `ttl == 0`; otherwise store (bounded queue, 50 packets, evict oldest non-critical).
4. If the device has internet, act as gateway: upload in batches and mark uploaded when the server returns `accepted` or `duplicate`. Retry with backoff for at least 2 minutes, because a free-tier server can take about a minute to wake after idling (new).
5. Otherwise forward: decrement ttl, wait a random delay (0–1 s critical, 1–5 s other), skip the peer it came from.
6. Rate-limit: at most $N$ new events per neighbour per minute; a per-device cap on relay duty cycle protects battery.
7. Relay is opt-in (a Settings toggle) and shows a persistent notification while active.

---

### 11.5 Transports behind one interface

```typescript
interface MeshTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPacket(cb: (raw: Uint8Array, peerId: string) => void): void;
  send(raw: Uint8Array, peerId?: string): Promise<boolean>; // no peerId = broadcast
  peers(): string[];
}
```

- **SimTransport (P0):** an in-memory graph of virtual phones with configurable adjacency. Used by unit tests and by the on-screen mesh visualiser for the demo.
- **BeaconTransport (P1):** advertise fragments as manufacturer data in rotation; scan and reassemble. Fragment header: type, 4-byte event short ID, index, count, then about 16 data bytes. Needs only advertise and scan, no GATT server.
- **GattTransport (post-hackathon):** connection-based transfer; needs a small native Kotlin module for the peripheral role.

---

### 11.6 Go/no-go spike (Dev C, first 6 hours)

Prove on two physical Android phones that: (a) phone 1 can advertise a 20-byte payload; (b) phone 2 can scan it in a foreground service; (c) a 192-byte packet can be fragmented, received and reassembled. If this is not working by hour 6, switch the demo to SimTransport plus a real two-phone beacon proof, and say so clearly on stage. We label what is real and what is simulated.

---

### 11.7 Known limits (stated honestly)

- Reliable background BLE is realistic on Android; iOS is heavily restricted.
- Delivery is opportunistic: it needs at least one relay-enabled phone in range and one with internet.
- Phone clocks can be wrong offline; the time window is deliberately generous.
- The server can read the SOS location (it is the recipient). It already holds trip location, so this does not widen exposure; stronger end-to-end protection needs the per-guardian upgrade.
- A gateway upload that reaches a sleeping free host is delayed by roughly a minute; the retry rule in 11.4 covers it, and the demo keeps the server warm.

