# SAFARSAATHI 2.0 — PHASE 5.1 FINAL AUDIT

**Audit date:** 14 November 2026 (IST)  
**Commit audited:** `f935d16dec2c0909bb813102b6f3151d719b0967`  
**Audit scope:** repository inspection only; no production code, migration, API contract, or Android code was changed.

## A. Executive Summary

The repository has a defined **v1 packet format** and a tested, pure-TypeScript simulation of the mesh, but it does not have a functioning server relay gateway or a physical BLE transport. The backend routes are intentionally wired as `501 NOT_IMPLEMENTED` stubs. Consequently, an encrypted packet cannot currently enter the server, create an SOS, or notify a guardian.

| Area | Readiness | Evidence |
|---|---|---|
| Packet codec, signing, encryption, fragmentation | Implemented and unit-tested | `lib/safety-core/src/packetCodec.ts`, `crypto.ts`, `test/safety-core.test.ts` |
| Relay store/forward simulation | Partial: in-memory simulation only | `lib/safety-core/src/relayEngine.ts`, `meshTransport.ts` |
| Android BLE scanning/advertising | Missing | no BLE library or native transport implementation; `app.json` only declares Android Bluetooth permissions |
| Relay bundle issuance | Missing | `artifacts/api-server/src/modules/me/service.ts#getRelayBundle` throws 501 |
| Relay upload gateway, verification, persistence | Missing | `artifacts/api-server/src/modules/relay/router.ts`, `service.ts` |
| Existing SOS lifecycle | Implemented, but direct-client entry only | `artifacts/api-server/src/modules/sos/service.ts#createSos` |

The primary security risks are: the unauthenticated upload endpoint has no dedicated abuse controls; the backend has no sender-tag-to-public-key lookup, signature verification, decryption, expiry validation, or durable deduplication; relay packet records lack provenance and validation metadata; and the mobile relay engine accepts structurally valid packets without signature verification. A packet's receipt, validation, persistence, SOS creation, and notification delivery are currently distinct only by design intent—none of the relay transitions are implemented.

## B. Existing Architecture and Ownership

```text
Phone A (offline) --[packet codec: implemented]--> simulated MeshTransport
  --[real BLE transport: missing / Dev B]--> gateway phone
  --[POST /v1/relay/packets: 501 stub / Dev A]--> API server
  --[relay validation + persistence: missing / Dev A]--> SOS service
  --[existing durable delivery + dispatch: implemented / Dev A]--> guardians
```

* **Dev A/backend:** Express mounts `/api/v1/relay` in `artifacts/api-server/src/routes.ts`. Its `relayRouter` has only `POST /packets`, which calls `notImplemented`; `RelayService.processPackets` contains four TODOs. `relay_packets` exists in `lib/db/src/schema/relay.ts` and a seven-day cleanup exists in `artifacts/api-server/src/workers/cleanup.ts`.
* **Dev C/shared contract:** `lib/safety-core` supplies codec, crypto, fragmentation, relay engine, and a simulated transport. `lib/api-spec/openapi.yaml` declares the bundle and upload endpoints; generated Zod/client packages reflect that contract.
* **Dev B/mobile:** `artifacts/safarsaathi/services/relay.ts` builds a real binary packet and uses `SimTransport`; it displays a simulated multi-hop path in `app/relay.tsx`. `app.json` declares scan/advertise/connect permissions, but `package.json` has no BLE radio package and the repository contains no scanning, advertising, GATT, or beacon transport implementation.

## C. Database Audit

`relay_packets` was created in `lib/db/migrations/0000_dear_leader.sql` and is represented by `lib/db/src/schema/relay.ts`.

| Field/constraint | Actual state | Audit finding |
|---|---|---|
| `event_id varchar(64) PRIMARY KEY` | Unique identity/deduplication key | Suitable for the codec's 16-byte event ID rendered as hex (32 chars), but no service uses it. The API contract does not explicitly define its output representation. |
| `raw text NOT NULL` | Stores raw packet as text | No documented encoding constraint, max length, checksum, or provenance. Expected base64 for a 192-byte packet is about 256 chars. |
| `dest_tag varchar(32) NOT NULL` | Indexed (`relay_packets_dest_tag_idx`) | Codec tag is 8 bytes / 16 hex chars, but no validation or lookup uses this column. |
| `received_at bigint NOT NULL` | Indexed (`relay_packets_received_at_idx`) | Retention worker deletes rows after 7 days. It is server-receipt time only; no created time, gateway receipt time distinction, or validation time is durable. |
| `status` check | `accepted`, `duplicate`, `invalid`, `expired` | Status vocabulary exists but does not distinguish malformed/signature/decrypt/destination/rate-limit failures or whether an SOS was created. |
| Foreign keys | None | No link to `sos_events`, source user, or gateway identity. |

The database migrations contain no later relay migration. The primary key is the only relay uniqueness constraint. This means duplicate audit rows cannot be retained under the same event ID: attempting to record a duplicate conflicts with the primary key. The schema cannot presently demonstrate a distinct received/validated/persisted/forwarded/SOS-created/delivered state machine.

`sos_events` is more mature (`lib/db/src/schema/sos.ts`): UUID primary key; FKs to user and optional trip; source constrained to `direct|ble_gateway`; optional `gateway_device_hash`; status constrained to `active|acknowledged|resolved|cancelled`; and indexes on user and status. Deliveries and acknowledgements have foreign keys, but no uniqueness constraint prevents duplicate `(sos_id, guardian_id, channel)` delivery rows or duplicate `(sos_id, guardian_id)` acknowledgements at the database level.

## D. Protocol Audit

The following is repository behavior, not a new protocol proposal.

| Question | Actual behavior and source | Status |
|---|---|---|
| What is a relay packet? | Exact 192-byte v1 binary: `ver|flags|eventId|destTag|createdAt|senderTag|ephPub|nonce|ciphertext|signature|ttl`. `lib/safety-core/src/packetCodec.ts` (`PACKET_BYTE_LENGTH`, `buildPacket`, `parsePacket`). | Implemented |
| Payload | 17-byte plaintext: signed location, accuracy, location timestamp, message code, battery, duress. `encodePlaintext` / `decodePlaintext`. | Implemented |
| Unique ID | The packet contains a 16-byte UUIDv4 event ID; the mobile service uses this as its SOS ID. `uuidToBytes`, `broadcastOfflineSosPacket`. Database PK is `relay_packets.event_id`. | Partial: server mapping/storage absent and output format ambiguous (codec uses hex; direct SOS/API uses UUID). |
| Origin identity | The sender has an Ed25519 public key stored as `users.sign_pub`; packet has rotating `senderTag = HMAC-SHA256(signPublicKey, epochDay)[0..8]`. `crypto.ts#computeSenderTag`, `users.ts`. | Partial: no indexed current/previous epoch-tag lookup or server resolution exists. |
| Forwarder identity | Client upload sends caller-reported `hops`; no gateway ID/auth header is in the OpenAPI item, router, or schema. `gatewayDeviceHash` is available on `sos_events` but unused. BLE `peerId` is simulation-only. | Missing/ambiguous |
| Authenticity/integrity | Ed25519 detached signature covers bytes 0–126, excluding mutable TTL. `verifyPacketSignature`; tests verify it. | Codec implemented; relay engine and backend never verify it. |
| Encryption | `tweetnacl.box` encrypts payload to server X25519 public key using ephemeral public key and 24-byte nonce; server private key decrypts. `boxEncryptWithEphemeral`, `decryptPacketPayload`. TLS would protect upload in deployment, but no server use of configured key exists. | Codec implemented; backend implementation missing. |
| Replay protection | Client `RelayEngine` keeps a process-memory event-ID cache for 24 h; server table primary key would support durable dedupe but is unused. | Partial; mobile cache is volatile and backend replay prevention missing. |
| Expiry | Client engine rejects packets more than `maxAgeSec` (default 86,400 seconds) from packet `createdAt`; bundle contract contains `maxAgeSec`. | Partial: client default is present, backend and bundle issuance absent. Clock-skew policy is unspecified. |
| Hops/hop limit | `ttl` starts at bundle policy, is decremented by every received relay, is excluded from signature, and zero is rejected. Upload's `hops` is client-reported and limited 0–20 by OpenAPI. | Partial: `ttl` works in simulation; `hops` is untrusted and no server cross-check exists. |
| Duplicate detection | Client uses event ID cache and bounded queue. DB PK could dedupe concurrently. | Partial: no backend implementation or test. |
| Backend arrival | Mobile `flushRelayUploads` calls generated `uploadRelayPackets`, but endpoint returns 501. | Missing |
| SOS conversion | Relay TODO says create/update SOS and fan out; no code invokes `SosService.createSos` or an equivalent relay-safe entry point. | Missing |

Approved documents (`docs/08-ble-relay-protocol.md`) describe the same design: the server is the encrypted packet recipient, relays see ciphertext only, and the gateway uploads it. They do not change the implementation finding above.

### Decisions or contracts still required

1. **Gateway provenance/authentication:** define whether any internet-connected authenticated SafarSaathi user may upload, whether anonymous uploads are intentional, and how a stable/revocable gateway device identifier is generated, transmitted, and hashed. Owner: Dev B/C contract decision, implemented by Dev A/B.
2. **Sender-tag lookup policy:** define current/previous epoch acceptance, index/storage strategy, deleted/tombstoned-user behavior, tag encoding, and clock-skew rules. The protocol document says an indexed tag table exists, but the database has none. Owner: Dev C contract stewardship plus Dev A schema/service.
3. **Canonical event ID representation:** settle UUID vs lower-case 32-hex event ID for API results, `relay_packets.event_id`, and SOS conversion. Owner: Dev C.
4. **Relay upload outcome semantics:** define whether invalid/expired/duplicate packets create forensic records and exact per-item statuses. Existing contract has only four values; it cannot report rate-limited, destination mismatch, signature failure, decrypt failure, or `sos_created` separately. Owner: Dev C; Dev A implements after agreement.

## E. SOS Integration Audit

The only implemented server entry point is `SosService.createSos(userId, CreateSosInput)` in `artifacts/api-server/src/modules/sos/service.ts`. It is the future integration point after relay validation, with a small internal extension or a relay-specific trusted entry to set `source: 'ble_gateway'` and `gatewayDeviceHash`. Calling the HTTP `/v1/sos` route is incorrect because it requires the originating Firebase identity, which an independent gateway cannot prove.

Current behavior relevant to a relay integration:

* It validates optional trip ownership against the originating user, checks the user exists, and uses a per-user PostgreSQL advisory lock.
* Idempotency is by `sos_events.id`: same owner gets current delivery state; a different owner gets `SOS_ID_CONFLICT`. This is a good mapping if packet event ID is canonically converted to the same UUID.
* Granted guardians receive a full alert/tracking URL; pending guardians receive a minimal alert; revoked and tombstoned guardians are excluded. `NotifyService` repeats those exclusions.
* Delivery rows are created before notification dispatch; dispatch then changes them to `sent` or `failed`. `recoverUndispatchedDeliveries` can recover queued rows when explicitly called.
* Acknowledgement validates active status, token or authenticated guardian identity, consent state, tombstones, and updates delivery/SOS state when all eligible deliveries are acknowledged.
* `audit_log` is append-only at the database level, but `createSos` and acknowledgement do not write a relay/SOS audit entry. Existing audit logging therefore does not form a complete relay trail.

Important limitation: `createSos` always persists `source: 'direct'`; it discards its optional location and battery inputs from `CreateSosInput`; and it assumes caller authentication has already established `userId`. A relay integration must not bypass its user/trip, consent, delivery, or idempotency logic, but it must safely provide the verified origin user and source metadata.

## F. Security Assessment

| Severity | Evidence-based risk | Consequence / required Phase 5 control |
|---|---|---|
| Critical | `/v1/relay/packets` is specified with `security: []` and the router has no gateway authentication or packet verification. | Once enabled without packet cryptographic validation, anyone could inject SOS traffic. Verify destination, resolve sender tag, verify signature, decrypt, and validate before SOS creation; add an explicit gateway abuse policy. |
| Critical | No backend implementation exists for expiry, dedupe, decrypt, persistence, or SOS source attribution. | Delivery cannot work and unsafe shortcuts could conflate receipt with successful alert creation. Implement a transactional ingestion state machine. |
| High | `SERVER_BOX_SECRET_KEY` / public key are optional and default to empty even in production (`config/env.ts`). | A deployment can enable relay routes with absent/malformed cryptographic key material. Require valid base64 32-byte key material before exposing relay functionality. |
| High | No sender-tag index/lookup exists despite the protocol requiring it. | Backend cannot identify the correct sign key, reject unregistered/deleted senders, or verify packet authenticity at scale. |
| High | Global IP limiting is the only effective current relay protection: 300 requests/15 min in non-test (`middleware/rateLimits.ts`); no per-gateway, per-packet, byte, or invalid-packet limits exist. | Storage/CPU exhaustion and public endpoint flooding. Apply a tight route limiter before base64 decode, bounded batch/item sizes, signature-work budgets, and metrics. |
| High | Mobile `RelayEngine.ingest` parses/deduplicates/forwards without signature or destination-tag verification. | A nearby attacker can cause relays to spend queue, battery, and airtime on fabricated structurally valid packets. Dev C/B should add a verifier callback or an explicitly documented relay-side trust policy. |
| Medium | `hops` and `receivedAt` in upload are caller-controlled; provenance is not stored. | Misleading forensic data and no accountable gateway. Treat both as untrusted telemetry; derive hop state from TTL only where possible and store a privacy-preserving gateway hash. |
| Medium | `relay_packets` has no source user/SOS FK, gateway hash, created/validated time, error reason, or SOS linkage. | Incomplete audit and difficult incident recovery. Add bounded, privacy-preserving lifecycle/provenance fields under a migration. |
| Medium | Queue and seen-cache are in memory; `flushRelayUploads` has no scheduled retry invocation, persistence, or proven two-minute retry mechanism. | Restart loses pending packets; stated cold-host recovery is not actually delivered. Dev B needs durable outbox and scheduler. |
| Medium | Raw encrypted packets are retained for seven days and logger redaction does not name `raw`, `b64`, `destTag`, `senderTag`, `eventId`, or gateway hashes. | Logs may retain correlation metadata if future code logs whole packet objects. Use allow-listed structured logs and retain only necessary forensic data. |
| Low | Beacon reassembly keys only on a 4-byte event-ID prefix and bounds fragment count but has no global bucket cap. | Collision/flood can consume memory during real radio use. Bound active buckets/bytes and verify a finished packet before enqueueing. |

At-rest relay payload is base64 ciphertext, not plaintext, and server request logs redact `body`; these are positive controls. HTTPS/TLS is an architectural assumption, not verified in this repository.

## G. Test Coverage and Gaps

`pnpm --filter @workspace/safety-core test` passed on this audit: **1 file, 10 tests**. It covers deterministic packet vectors; parse/sign/decrypt; mutable TTL signature invariance; fragmentation/reassembly; sender-tag rotation; and simulated A→B→C forwarding with loop deduplication.

| Requirement | Existing coverage | Gap |
|---|---|---|
| Valid backend relay ingestion | No | Route is 501. |
| Invalid/tampered packet rejection | No backend test; signature success only in core vectors | Need malformed, bad version, invalid signature, destination mismatch, decrypt failure. |
| Duplicate/replay | Simulated in-memory duplicate test | Need persistent duplicate and concurrent gateway-upload tests. |
| Expired packet rejection | No explicit test | Need boundary, future timestamp, and clock-skew tests. |
| Unauthorized device/gateway rejection | No | Upload is deliberately public by contract; policy is undecided. |
| Payload size/batch enforcement | `reliability.test.ts` exercises global 64 KB parser limit only | Need generated request-schema validation and per-item exact-base64/192-byte checks. |
| Rate limiting/flooding | No relay-specific test | Need route limiter, invalid-signature work budget, storage quota tests. |
| Durable relay persistence | No | Need transaction, status semantics, retention, and DB constraints tests. |
| Forward/retry/recovery | Core simulation only | Need Android durable-outbox and server retry/recovery tests. |
| Offline SOS idempotency | Direct SOS only: `sos-idempotency.test.ts` | Need integration from one valid packet through one SOS only. |
| Guardian consent | Direct SOS tests cover granted/pending/revoked policy | Must repeat through relay entry point. |
| Audit trail | No relay audit test | Need append-only relay lifecycle records and redaction assertions. |

`pnpm typecheck` was also run. `lib/db`, `lib/safety-core`, and `artifacts/api-server` passed. The command stopped at `artifacts/safarsaathi/tsconfig.json(4,27): TS5103 Invalid value for --ignoreDeprecations` under TypeScript 6. The previously reported unresolved `@workspace/db` and `@workspace/api-zod` issue was **not reproduced** and does not block this audit; the mobile TS configuration issue is unrelated to the unimplemented relay gateway.

## H. Ownership and Dependencies

| Requirement | Existing implementation | Owner | Blocker |
|---|---|---|---|
| BLE packet format | Codec/doc/test vectors exist | Dev C | No, subject to representation clarifications |
| Device/origin identity | User `signPub` exists; sender tag derived | Dev B/C | Yes: server tag lookup/device lifecycle absent |
| Packet authentication | Ed25519 primitive exists | Dev C / Dev A | Yes for end-to-end use: backend/mobile verification absent |
| Relay ingestion API | OpenAPI + generated client exist; backend 501 | Dev A | No for initial implementation once outcome semantics are settled |
| Packet persistence | Table exists; no service | Dev A | No, schema needs lifecycle/provenance decisions |
| Deduplication | Core cache + DB PK concept | Dev A | No, implement transactional DB use |
| Packet forwarding | SimTransport only | Dev A/B | Yes for real BLE; backend gateway can proceed independently |
| Offline SOS integration | Existing direct service, source field | Dev A | No, require trusted internal entry and canonical ID agreement |
| Retry/recovery | Direct SOS recovery method; relay has no durable scheduler | Dev A/B | Yes for reliability completion |
| Android BLE implementation | Permissions and simulator only | Dev B | Yes |
| API contracts | Endpoints/types exist | Dev C | Partial: authentication/provenance and error/outcome semantics unresolved |

## I. Phase 5 Implementation Breakdown

### 5.2 Relay ingestion gateway

1. Dev C confirms canonical event-ID, raw encoding, and per-item outcome semantics; Dev B/C decide gateway identity/auth policy.
2. Dev A validates the generated upload shape plus exact base64 decode/192-byte limit, batch bounds, and destination tag before expensive work.
3. Dev A implements sender-tag lookup for current/previous permitted epoch, rejects deleted/tombstoned/unregistered origins, verifies Ed25519, then decrypts with validated server key material.
4. Dev A persists a clearly defined per-packet outcome transactionally and returns receipt/validation outcome only—not delivery success.

### 5.3 Forwarding and deduplication

1. Dev A uses an atomic database unique insert/upsert keyed by canonical event ID and tests concurrent requests.
2. Dev B makes the relay outbox durable, runs retry on connectivity/background lifecycle, and only marks upload after accepted/duplicate server response.
3. Dev C/B add verifier and bounded reassembly/queue policy to the real transport path; Dev B implements scan/advertise/fragment/reassembly.

### 5.4 Offline SOS integration

1. Dev A adds a trusted internal SOS entry that accepts only a fully validated relay packet and writes `source='ble_gateway'` and privacy-preserving gateway provenance.
2. It reuses `SosService` user/trip validation, idempotency, guardian consent selection, delivery rows, dispatch, recovery, and acknowledgement—not the public authenticated route.
3. Test packet event ID → exactly one SOS → correct granted/pending/revoked delivery behavior.

### 5.5 Reliability and abuse protection

1. Require production relay keys; add route-specific rate/work limits and metrics for malformed, invalid, duplicate, expired, accepted, SOS-created, and notification outcomes.
2. Record append-only relay lifecycle audit events without raw payload/location/token logging.
3. Add retry/recovery worker scheduling, dead-letter/terminal behavior, retention monitoring, and storage bounds.

### 5.6 Final integration verification

1. Run isolated codec vectors across mobile and server, API integration tests, concurrent replay/abuse tests, and consent/acknowledgement regression tests.
2. Dev B validates two physical Android phones for scan/advertise/fragment/reassembly, then gateway upload through the production-equivalent TLS endpoint.
3. Verify observability distinguishes: received → validated → persisted → SOS-created → delivery queued/sent/failed → acknowledged.

## J. Real Blockers

| Blocker | Owner | Evidence | Consequence | Unblock requirement |
|---|---|---|---|---|
| No physical BLE transport | Dev B | no BLE dependency/transport implementation; only `SimTransport`; Bluetooth permissions in `app.json` | No real offline multi-hop delivery | Implement and validate scan/advertise/reassembly foreground service against `MeshTransport`. |
| Backend relay/bundle are stubs | Dev A | `getRelayBundle` and POST router throw 501; `RelayService` TODOs | Packets cannot be provisioned or ingested | Phase 5.2 implementation. This is expected phase work, not a contract ambiguity. |
| Sender-tag lookup/index policy absent | Dev C + Dev A | `computeSenderTag` and `users.signPub` exist; no tag table/query | Server cannot efficiently/consistently find sign key or authenticate origin | Agree acceptance/window/encoding/deletion policy; add schema/service. |
| Gateway identity/auth and provenance undefined | Dev B/C + Dev A | OpenAPI explicitly `security: []`; only user key fields exist; `gatewayDeviceHash` unused | Public endpoint abuse and no accountable relay source | Define anonymous vs authenticated upload, device registration/rotation, and privacy-preserving hash. |
| Upload outcome/lifecycle contract incomplete | Dev C | Contract has four statuses only and no separation of packet/SOS/delivery state | Clients may mistake accepted packet for guardian alert | Specify exact meanings and optional lifecycle correlation; preserve non-equivalence in UI/retry logic. |
| Mobile typecheck configuration fails | Dev B | `TS5103` in safarsaathi `tsconfig.json` | Prevents full CI verification | Update configuration to match pinned TypeScript policy; unrelated to relay design. |

## K. Phase 5.2 Readiness Verdict

**PARTIALLY READY — Independent work can begin, but named dependencies remain.**

Dev A can immediately implement the server-side mechanical gateway work: strict input decoding, environment/key validation, DB transaction/deduplication, expiry checks, a trusted internal SOS bridge, and test scaffolding. Dev A must not choose the gateway identity model, sender-tag lookup window/representation, or client-visible outcome semantics unilaterally. Those three decisions require Dev B/C agreement before a secure interoperable endpoint can be finalized.

**Exact next actions:**

1. Dev C publishes an addendum resolving canonical event ID, sender-tag lookup/epoch window, and upload-result semantics.
2. Dev B/C choose and document gateway identity/auth/provenance behavior and the real BLE transport plan.
3. Dev A implements 5.2 behind those agreed contract details, then adds a relay-safe internal call into the existing `SosService` for 5.4.
4. Dev B fixes the mobile TypeScript configuration and implements/validates real BLE before claiming an offline end-to-end path.
