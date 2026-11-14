# Phase 5.4 Dev B Relay Integration Handoff

- Obtain `GET /api/v1/me/relay-bundle` with the authenticated Firebase bearer token.
- Bundle fields: `serverBoxPublicKey`, `epoch`, `destTagForGateway` (8-byte hex), `ttlStart`, `maxAgeSec`, `minAppVersion`.
- Construct the existing 192-byte v1 packet using `@workspace/safety-core`; do not alter fields or cryptography.
- Upload batches to `POST /api/v1/relay/packets` as `{ packets: [{ b64, receivedAt, hops }] }`.
- The server treats `b64` packet bytes as authoritative; `receivedAt` and `hops` are untrusted telemetry.
- `accepted` means the packet was durably accepted for SOS processing; `duplicate` means the event ID was already known; `invalid` and `expired` are terminal packet outcomes.
- Retry transport failures with bounded backoff. Do not retry cryptographic or expiry rejection indefinitely.
- The backend worker persists processing state and recovers abandoned jobs after lease expiry.
- Real BLE scan/advertise, fragmentation, local queueing, and background behavior remain Dev B-owned.

Open dependency: the API server cannot yet start with plain Node until Dev C publishes runtime JavaScript exports for `@workspace/safety-core` and `@workspace/api-zod`.
