# SafarSaathi 2.0 - Backend API Server (`artifacts/api-server`)

SafarSaathi 2.0 backend is an Express 5 + TypeScript + PostgreSQL (via Drizzle ORM) platform designed to operate at **₹0 recurring cost** with no paid or card-gated services (No Twilio, No Google Maps).

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x
- PostgreSQL instance running locally or a free Supabase Postgres project

### 2. Install Dependencies
```bash
# From workspace root
pnpm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` points to your Postgres database and `TICK_SECRET` has a local secret.

### 4. Database Setup
```bash
# Generate Drizzle schema migrations
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Seed demo data (users, guardians, zones)
pnpm db:seed
```

### 5. Run API Server
```bash
# Start in watch mode with tsx
pnpm dev

# Check liveness
curl http://localhost:3000/api/healthz
# Returns: {"status":"ok","service":"safarsaathi-api",...}
```

---

## ⏱️ How Tickers and Watchdogs Work

Render's free tier spins down idle instances after 15 minutes of inactivity. To prevent missed watchdog alerts and database idling on Supabase, SafarSaathi uses a **dual-ticker architecture**:

1. **cron-job.org (Primary Ticker)**: Calls `POST /internal/tick` every **1 minute**.
2. **GitHub Actions Workflow (Secondary Ticker)**: Calls `POST /internal/tick` every **5 minutes** (`.github/workflows/tick.yml`).
3. **In-Process Loop (Awake State)**: When the server is awake and servicing requests, an internal timer fires `watchdogWorker.runDueChecks('in_process')` every **15 seconds**.
4. **Boot-Time Catch-Up**: On server wake-up/cold start, `runBootCatchUp()` sweeps Postgres immediately for overdue trips or watch timers.

### Concurrency & Locking
The watchdog uses `SELECT ... WHERE next_check_at <= now() FOR UPDATE SKIP LOCKED` inside a transaction. Overlapping ticks or instances never process or escalate the same trip twice.

---

## 🔒 Security & Privacy Conventions

- **IDOR Prevention**: Every query is strictly scoped to `req.user.uid` from the verified Firebase ID token (or dev bypass header `x-dev-user-id` in non-production).
- **Log Redaction**: Pino automatically redacts coordinates, phone numbers, and message bodies.
- **Timing Attacks**: The `X-Tick-Secret` header and share tokens are compared using `constantTimeEqual` (crypto.timingSafeEqual).
- **Body Caps & Rate Limiting**: All JSON payloads capped at 64KB with per-IP and per-user rate limiters.

---

## 🧪 Testing & Type Checking

```bash
# Type check all TypeScript files
pnpm typecheck

# Run test suite
pnpm test
```

