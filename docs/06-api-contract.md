# API Contract (v1)

> **Title**: API Contract (v1) Conventions, Endpoints, Payload Shapes & Notification Content  
> **Source Sections**: Section 9 (API contract v1, 9.1 Endpoints, 9.2 Key payload shapes, 9.3 Notification content)  
> **Owner**: Dev A & Dev C (Steward: Dev C)  
> **Status**: Frozen at W4  
> [← Back to Documentation Index](README.md)

---

## 9. API contract (v1)

The contract is frozen at W4 and everyone follows the same conventions; this edition adds two proxy endpoints and an internal tick endpoint.

### Conventions (frozen)

- **Base path** `/api/v1`. JSON only. Auth header `Authorization: Bearer <Firebase ID token>` on everything except the public tracking endpoints, the Telegram webhook and the internal tick.
- **All timestamps are integers:** epoch milliseconds, UTC. Field names end in `At` or are named `ts`.
- **IDs for client-created objects** (`sosId`, `tripId`) are client-generated UUIDv4, so retries and offline creation are idempotent.
- **Errors:** `{ error: { code: 'string_code', message: 'human text', details?: any } }` with the proper HTTP status.
- **Lists** are plain arrays unless pagination is needed (not in v1). Coordinates: `{ lat: number, lng: number, acc?: number, ts: number }`.

---

### 9.1 Endpoints

#### Inside `/api/v1`

| Method | Path | Purpose | Owner |
| :--- | :--- | :--- | :--- |
| `PUT` | `/me` | Upsert profile: name, phone, push token, public keys (box + sign), language | A |
| `GET` | `/me` | Read profile and settings | A |
| `DELETE` | `/me` | Delete account and all data | A |
| `GET` | `/guardians` | List guardians with consent status and channels | A |
| `POST` | `/guardians` | Add guardian (phone, optional email, preferred channels); sends consent SMS and returns a Telegram deep link the guardian may open | A |
| `DELETE` | `/guardians/{id}` | Remove; revokes links | A |
| `POST` | `/routes` | Route and ETA via the OpenRouteService proxy; returns polyline, duration, distance and source (`ors`, `cache` or `straight_line`) (new) | A |
| `GET` | `/places/search` | Debounced place search through the geocoding proxy (new) | A |
| `POST` | `/trips` | Create trip (client UUID) with destination, route polyline, ETA | A |
| `POST` | `/trips/{id}/locations` | Batch location ingest (idempotent by `ts`) | A |
| `POST` | `/trips/{id}/end` | End trip safely | A |
| `POST` | `/trips/{id}/share` | Create expiring share link | A |
| `DELETE` | `/trips/{id}/share` | Revoke link | A |
| `POST` | `/sos` | Create SOS (client UUID), idempotent | A |
| `POST` | `/sos/{id}/locations` | Live updates during SOS | A |
| `POST` | `/sos/{id}/cancel` | Cancel with `pinKind: 'cancel' | 'duress'`; duress keeps alerting | A |
| `POST` | `/sos/{id}/ack` | Guardian acknowledge (token or auth) | A |
| `GET` | `/sos/{id}` | Status with per-guardian, per-channel delivery | A |
| `POST` | `/watch` | Start Watch Me (minutes) | A |
| `POST` | `/watch/{id}/confirm` | User confirms safe | A |
| `GET` | `/me/relay-bundle` | Server public key, epoch tags, TTL policy for offline use | A + C |
| `POST` | `/relay/packets` | Gateway upload: array of base64 packets, idempotent by event ID | A + C |
| `GET` | `/safety/zones` | Zones near `lat,lng,radius,timeOfDay` | A |
| `POST` | `/safety/reports` | Submit a report (rate-limited) | A |
| `POST` | `/rides` | Register ride (plate, driver, expected route); shares with guardians | A |

#### Outside `/api/v1` (not in the generated client)

| Method | Path | Purpose | Owner |
| :--- | :--- | :--- | :--- |
| `GET` | `/t/{token}` | Public HTML tracking page | A |
| `GET` | `/public/track/{token}` | Public JSON for that page | A |
| `POST` | `/internal/tick` | Run due watchdog checks; requires the `X-Tick-Secret` header; idempotent; called by the free tickers | A |
| `POST` | `/integrations/telegram/webhook` | Telegram bot updates (consent and acknowledgements); verified by Telegram's secret token header | A |
| `GET` | `/api/healthz`, `/api/readyz` | Liveness, and database plus last-tick age | A |

---

### 9.2 Key payload shapes

#### `POST /sos`
```typescript
{
  sosId: uuid,
  tripId?: uuid,
  trigger: 'button' | 'shake' | 'prompt_timeout' | 'watchdog' | 'ble_relay',
  duress: boolean,
  location?: Coord,
  battery?: number,
  createdAt: number
}
// -> 201
{
  sosId: uuid,
  status: 'active',
  guardians: [
    { guardianId: string, channel: string, status: string }
  ]
}
```

#### `POST /trips/{id}/locations`
```typescript
{
  points: [Coord, ...up to 50]
}
// -> 200
{
  accepted: number,
  lastSeenAt: number
}
```

#### `POST /routes`
```typescript
{
  origin: Coord,
  destination: Coord
}
// -> 200
{
  polyline: string,
  durationSec: number,
  distanceM: number,
  source: 'ors' | 'cache' | 'straight_line'
}
```

#### `POST /relay/packets`
```typescript
{
  packets: [
    { b64: string, receivedAt: number, hops: number }
  ]
}
// -> 200
{
  results: [
    { eventId: hex, status: 'accepted' | 'duplicate' | 'invalid' | 'expired' }
  ]
}
```

#### `GET /me/relay-bundle`
```typescript
{
  serverBoxPublicKey: b64,
  epoch: number,
  destTagForGateway: hex8,
  ttlStart: 10,
  maxAgeSec: 86400,
  minAppVersion: string
}
```

**Delivery channel** is one of `push`, `sms`, `telegram`, `email`; **delivery status** is one of `queued`, `sent`, `failed`, `acknowledged`.

---

### 9.3 Notification content (frozen)

- **To the user (lock screen):** title "SafarSaathi", body "Reminder" (neutral). Detail is shown only after unlocking.
- **To guardians (SMS):** "SafarSaathi alert: {name} may need help. Live location: {url}. Reply is not monitored. If urgent call 112." (English plus a Hindi line.) Only the name and a tokenised link go in the text, never coordinates.
- **To guardians (push, Telegram, email):** the same text; push adds the deep link `safarsaathi://sos/{id}`.

