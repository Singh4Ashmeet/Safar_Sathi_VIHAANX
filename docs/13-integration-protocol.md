# Integration Protocol & Verification

> **Title**: Integration Protocol (Nine Rules), Contract Change Process, Environment Contract & IT-1–IT-12 Checklist  
> **Source Sections**: Section 16 (Integration protocol, 16.1–16.4)  
> **Owner**: All (Lead: Dev C)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 16. Integration protocol (the smooth-integration guarantee)

The nine rules are unchanged; the environment contract and the integration tests now cover the free services.

### 16.1 Nine rules

1. **Contract first.** `openapi.yaml` is the single source of truth. Nobody codes against an endpoint that is not in it.
2. **Generated code only.** The app uses generated hooks; the server validates with generated zod schemas. No hand-written API types or raw `fetch` for app data.
3. **Stubs first.** C commits `services/*` stubs at W3. B builds against stubs; C swaps in real implementations without changing signatures.
4. **Mock before real.** Prism serves the contract from W3 so B can run every screen before A's endpoints exist. A switch (`EXPO_PUBLIC_API_URL`) points the app at mock or real.
5. **One shared core.** Packet codec, crypto and risk engine live only in `safety-core`, imported by both app and server. Golden test vectors (`test-vectors.json`) must pass on both sides.
6. **Additive-only after freeze (W4).** New optional fields and new endpoints are fine; renames and removals need A + B approval and a same-day fix.
7. **Same conventions everywhere:** epoch-millisecond timestamps, client-generated UUIDs, the standard error envelope, `/api/v1` prefix.
8. **One env contract.** `.env.example` lists every variable (16.3); no hidden config.
9. **Definition of Integrated.** A feature counts as done only when it passes its integration test (16.4) on real phones against the deployed server.

---

### 16.2 Contract change process

1. Open a PR that changes only `openapi.yaml` (title `contract: ...`).
2. Tag Dev A and Dev B; both approve within 30 minutes.
3. Dev C regenerates clients and commits; A and B rebase.
4. A implements, B consumes; the Prism mock is updated in the same PR.

---

### 16.3 Environment variables

No Google Maps key and no Twilio variables remain; nothing in the app bundle is a secret.

| Variable | Used by | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | Backend | Supabase pooled Postgres connection string |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend | Verify ID tokens |
| `SERVER_BOX_SECRET_KEY`, `SERVER_BOX_PUBLIC_KEY` | Backend | Relay decryption; the public key goes into the relay bundle |
| `SMS_PROVIDER` | Backend | `console` or `android-gateway` |
| `SMS_GATEWAY_URL`, `SMS_GATEWAY_USER`, `SMS_GATEWAY_PASSWORD`, `SMS_GATEWAY_PASSPHRASE` | Backend | Gateway phone API (cloud or local mode) and its end-to-end passphrase |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Backend | Telegram channel |
| `SMTP_URL` | Backend | Free SMTP account for the email channel |
| `ORS_API_KEY`, `ROUTING_DAILY_LIMIT` | Backend | OpenRouteService key and the soft cap used by the quota guard (for example 1,800 of the 2,000 daily calls) |
| `TICK_SECRET` | Backend, tickers | Shared secret for `/internal/tick` |
| `PUBLIC_BASE_URL` | Backend | Builds tracking links (the free host URL) |
| `GUARDIAN_TILE_URL` | Backend | Raster tile URL for the guardian page, switchable if a provider throttles |
| `WATCHDOG_SIGNAL_LOST_SEC`, `WATCHDOG_LOST_CONTACT_SEC`, `WATCHDOG_ETA_GRACE_SEC` | Backend | Tunable thresholds (defaults 180, 300, 600) |
| `RETENTION_TRIP_POINTS_DAYS` | Backend | Data retention (default 7 on the free tier) |
| `ALLOWED_ORIGINS` | Backend | CORS allow-list |
| `EXPO_PUBLIC_API_URL` | App | Mock or real API |
| `EXPO_PUBLIC_MAP_STYLE_URL` | App | OpenFreeMap style URL for MapLibre |
| `EXPO_PUBLIC_FEATURES` | App | Feature flags |

---

### 16.4 Integration test checklist (run at M3 and M5 on real phones)

| ID | Scenario | Pass condition |
| :--- | :--- | :--- |
| **IT-1** | Sign up, onboarding, profile upsert | `GET /me` shows keys, push token, language |
| **IT-2** | Add guardian | Consent SMS received on a verified number via the gateway phone; Telegram link works |
| **IT-3** | Trip with screen locked for 5 minutes | Server `last_seen_at` keeps advancing |
| **IT-4** | Guardian opens link on a basic browser | Marker moves at least every 10 s; no-JS fallback shows last position; revoke shows "expired" |
| **IT-5** | One-tap SOS online | Guardian SMS and push within 10 s; duplicate POST gives one event; delivery panel updates |
| **IT-6** | Duress PIN | UI shows "cancelled"; server keeps alerting, `duress = true` |
| **IT-7** | Force-stop the app mid-trip | Watchdog alerts guardians within the configured window |
| **IT-8** | Airplane-mode SOS with a gateway phone nearby (sim or real) | Packet uploaded, decrypted, guardian alerted, `source = ble_gateway` |
| **IT-9** | Watch Me expiry with app closed | Guardians alerted by the server |
| **IT-10** | Cross-user access attempt | 403 or 404 on another user's trip, SOS and guardians |
| **IT-11** | Gateway phone off (new) | Guardian alerted on another channel within 30 s; the user sees SMS failed |
| **IT-12** | Cold start (new) | After 20 minutes idle, an SOS still reaches guardians; the app shows the waking state and retries; the tick log shows no gap above 3 minutes during the test |

