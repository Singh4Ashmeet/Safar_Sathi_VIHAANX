# SafarSaathi 2.0 — Agent Instructions

## Monorepo Structure

```
Safar_Sathi/
├── artifacts/
│   ├── api-server/          # Express 5 + TypeScript + PostgreSQL (Drizzle ORM)
│   └── safarsaathi/         # Expo + React Native (mobile app)
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen
│   ├── api-zod/             # Zod schemas generated from OpenAPI
│   ├── api-client-react/    # TanStack Query hooks + types (generated)
│   ├── db/                  # Drizzle schema + client (PostgreSQL)
│   └── safety-core/         # Pure TS: BLE relay, crypto, risk engine, mesh
├── docs/                    # Full spec (00-overview.md → 14-demo-risks-cutlines.md)
├── .github/workflows/       # CI (ci.yml) + backup ticker (tick.yml)
└── package.json             # pnpm workspace root scripts
```

**Package manager**: pnpm@10.33.0 (see `packageManager` in root package.json)

---

## Key Commands (run from workspace root)

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build all (db → api-server) | `pnpm build` |
| Typecheck all libs + packages | `pnpm typecheck` |
| Run all tests | `pnpm test` |
| Generate DB migrations | `pnpm db:generate` |
| Apply DB migrations | `pnpm db:migrate` |
| Seed DB | `pnpm db:seed` |
| Generate API client (Orval) | `pnpm gen:api` |
| Start mock API (Prism) | `pnpm mock:api` |

### Per-package scripts (run inside package dir or with `--filter`)

**`artifacts/api-server`**
- `pnpm dev` — dev server with tsx watch
- `pnpm start` — run built dist
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest run

**`lib/db`**
- `pnpm build` — tsc (emits dist/)
- `pnpm db:generate` — build + drizzle-kit generate
- `pnpm db:migrate` — drizzle-kit migrate
- `pnpm db:seed` — tsx src/seed.ts

**`lib/api-spec`**
- `pnpm codegen` — orval (generates lib/api-zod + lib/api-client-react)
- `pnpm mock` — prism mock openapi.yaml on :4010

**`lib/safety-core`**
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest run

**`artifacts/safarsaathi` (mobile)**
- `pnpm dev` — expo start --dev-client
- `pnpm android` — expo run:android
- `pnpm ios` — expo run:ios
- `pnpm typecheck` — tsc --noEmit

---

## Development Workflow

### 1. API Contract Changes
1. Edit `lib/api-spec/openapi.yaml`
2. Run `pnpm gen:api` (generates Zod schemas + React Query hooks)
3. Update backend types if needed (`artifacts/api-server` imports from `@workspace/api-zod`)

### 2. Database Schema Changes
1. Edit files in `lib/db/src/schema/`
2. Run `pnpm db:generate` (creates migration in `lib/db/drizzle/`)
3. Run `pnpm db:migrate` to apply

### 3. Adding a New Package
- Add to `pnpm-workspace.yaml` packages array
- Follow existing conventions: `type: "module"`, exports map, `@workspace/*` deps

---

## Critical Architecture Notes

### Dual-Ticker Watchdog (prevents Render free-tier spin-down)
- **Primary**: cron-job.org → `POST /internal/tick` every 1 min
- **Backup**: GitHub Actions (`.github/workflows/tick.yml`) → every 5 min
- **In-process**: 15s timer when server awake
- **Boot catch-up**: Runs on cold start

**Secret**: `TICK_SECRET` in `X-Tick-Secret` header (constant-time compare)

### Security Conventions
- **IDOR prevention**: All queries scoped to `req.user.uid` from verified Firebase ID token
- **Dev bypass**: `x-dev-user-id` header only works when `DEV_AUTH_BYPASS=true` (never in prod)
- **Log redaction**: Pino redacts coords, phones, message bodies
- **Timing attacks**: `tweetnacl` constantTimeEqual for secrets

### Free-Stack Constraints
- **No paid services**: No Twilio, no Google Maps, no paid Firebase
- **Supabase Postgres**: 500 MB free tier → `RETENTION_TRIP_POINTS_DAYS=7` purge
- **OpenRouteService**: 2,000 directions/day → `ROUTING_DAILY_LIMIT=1800` soft cap
- **SMS**: `console` (dev) or `android-gateway` (spare phone via SMS Gateway app)
- **Telegram**: Free Bot API for guardian consent/SOS ack
- **Email**: Free SMTP (Gmail app password / Brevo)

---

## Environment Variables

Root `.env.example` documents all vars. Key ones:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes (prod) | Supabase pooled Postgres (plain, no Auth/Storage/Realtime) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes (prod) | Firebase Spark plan service account |
| `SERVER_BOX_SECRET_KEY` | Yes (relay) | X25519 private key (base64) for BLE relay decryption |
| `SERVER_BOX_PUBLIC_KEY` | Yes (relay) | X25519 public key (base64) for client bundle |
| `TICK_SECRET` | Yes | Rotate from default before prod |
| `ORS_API_KEY` | Yes (routing) | OpenRouteService free key |
| `SMS_PROVIDER` | No | `console` or `android-gateway` |
| `PUBLIC_BASE_URL` | Yes (prod) | Render URL for tracking links |

**Mobile app** uses `EXPO_PUBLIC_*` vars only (no secrets in bundle).

---

## Testing

- **CI runs**: `pnpm typecheck` → `pnpm test` (see `.github/workflows/ci.yml`)
- **api-server tests**: vitest, node env, `DEV_AUTH_BYPASS=true` in test env
- **safety-core tests**: vitest, node env, test vectors in `test-vectors.json`
- **Mock API**: `pnpm mock:api` runs Prism on :4010 for mobile dev

---

## Mobile Development (Expo)

```bash
# From artifacts/safarsaathi
pnpm dev              # Start Expo dev server
pnpm android          # Build & run on Android device/emulator
# For Android physical device over USB:
adb reverse tcp:4010 tcp:4010  # Forward mock API port
```

- Uses Expo Router (file-based routing in `app/`)
- MapLibre + OpenFreeMap (no API key)
- Firebase Auth (Spark plan) — config in `EXPO_PUBLIC_FIREBASE_*`
- Feature flags: `EXPO_PUBLIC_FEATURES=relay,ride,fakecall,demo`

---

## References

- **Spec**: `docs/00-overview.md` → `docs/14-demo-risks-cutlines.md` (read in order)
- **Runbook**: `docs/runbook.md` (deploy, tickers, TICK_SECRET rotation, SMS gateway, DB restore, demo warm-up)
- **Env vars**: `docs/backend/env-variables.md`
- **Integration protocol**: `docs/13-integration-protocol.md` (contract change process)
- **API contract**: `lib/api-spec/openapi.yaml` (source of truth over docs)