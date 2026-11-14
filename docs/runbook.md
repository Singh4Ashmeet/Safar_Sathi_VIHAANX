# Operations Runbook — SafarSaathi 2.0 (Free-Stack Edition)

> **Title**: Operations Runbook  
> **Source Sections**: Section 17.1 (Warm-up routine), Section 8.4 (Watchdog), Section 13.3 (Security), Section 15.3 (Day-Zero)  
> **Owner**: Dev A (Backend / Infrastructure)  
> **Status**: Operational Guide  
> [← Back to Documentation Index](README.md)

---

## 1. Deploy: Render Free Web Service

### Prerequisites
- GitHub repository connected to Render account (free plan, no credit card required).
- Supabase free PostgreSQL project active (free tier, 500 MB).
- Firebase project on Spark free plan (service account key JSON generated).

### Step-by-Step Deployment
1. **Create Web Service:**
   - In Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
   - Connect the repository `Safar_Sathi`.
   - Select **Root Directory**: `.` (monorepo root).
   - **Runtime**: `Node`.
   - **Region**: `Singapore` (recommended for Delhi NCR latency) or `Oregon`.
   - **Branch**: `main`.
2. **Build and Start Commands:**
   - **Build Command:** `pnpm install --frozen-lockfile && pnpm build`
   - **Start Command:** `node artifacts/api-server/dist/index.js`
   - **Plan:** `Free` (0.1 CPU, 512 MB RAM).
3. **Configure Health Check Path:**
   - Set **Health Check Path** to `/api/healthz` (liveness probe).
   - *Important:* Never use `/api/readyz` as Render's startup probe because `/api/readyz` depends on watchdog tick age, whereas `/api/healthz` verifies process liveness immediately without dependency recursion.
4. **Environment Variables (Render Dashboard $\rightarrow$ Environment):**

| Key | Value / Source | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production mode and strict security guards |
| `PORT` | `10000` | Port automatically assigned by Render |
| `DATABASE_URL` | `postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Supabase IPv4 **pooled** connection string (port 6543) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `{"type":"service_account",...}` | Single-line compact JSON from Firebase Console |
| `DEV_AUTH_BYPASS` | `false` | **Mandatory:** Bypass must be strictly disabled in production |
| `TICK_SECRET` | *(64-char random hex string)* | Generated secret for authenticating `/internal/tick` |
| `PUBLIC_BASE_URL` | `https://<your-service>.onrender.com` | Public HTTPS base URL for shareable tracking links |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins for client access |
| `SMS_PROVIDER` | `console` | Set to `android-gateway` when spare phone is active |
| `ROUTING_DAILY_LIMIT` | `1800` | Soft daily quota guard for OpenRouteService |
| `WATCHDOG_SIGNAL_LOST_SEC` | `180` | Stale threshold for signal loss escalation |
| `WATCHDOG_LOST_CONTACT_SEC`| `300` | Contact loss escalation threshold |
| `WATCHDOG_ETA_GRACE_SEC` | `600` | ETA overdue grace period |
| `RETENTION_TRIP_POINTS_DAYS` | `7` | Days to keep high-frequency location points before purge |

5. **Local Laptop Fallback (Demo / Offline Contingency):**
   - If Render free instance experiences cold-start latency or unexpected outages:
     - Run backend locally: `pnpm --filter api-server start` on port 3000.
     - Start Cloudflare Quick Tunnel: `cloudflared tunnel --url http://localhost:3000`.
     - Update mobile app `EXPO_PUBLIC_API_URL` to Cloudflare tunnel HTTPS URL.

---

## 2. External Watchdog Tickers

SafarSaathi 2.0 uses a dual external ticker architecture to solve the Render free-tier idle spin-down (15-minute sleep) and maintain the server-side watchdog dead-man's switch.

```
┌─────────────────────────────────┐
│ cron-job.org (Every 1 minute)   │───┐
└─────────────────────────────────┘   │
                                      ▼
┌─────────────────────────────────┐  POST /internal/tick   ┌───────────────────────────┐
│ GitHub Actions (Every 5 minutes)│───────────────────────►│ Render Free API           │
└─────────────────────────────────┘  (X-Tick-Secret: ...)  │ - Runs watchdog sweep     │
                                                           │ - Writes tick_log entry   │
                                                           │ - Resets idle sleep timer │
                                                           └───────────────────────────┘
```

### Primary Ticker: cron-job.org (Every 1 minute)
1. Register a free account at [cron-job.org](https://cron-job.org).
2. Click **Create Cronjob**:
   - **Title:** `SafarSaathi Watchdog Ticker`
   - **URL:** `https://<your-service>.onrender.com/internal/tick`
   - **Execution Schedule:** Every `1 minute` (`* * * * *`).
   - **Request Method:** `POST`
   - **Request Headers:**
     - `Content-Type: application/json`
     - `X-Tick-Secret: <YOUR_TICK_SECRET>`
   - **Request Body:** `{"source": "cron"}`
   - **Request Timeout:** `30 seconds`
3. **Failure Notifications:** Enable email notification on 3 consecutive failures.
4. **Cadence Rationale:** The watchdog stale threshold is 180 seconds (3 minutes). Executing every 1 minute ensures that even if one tick is delayed, the watchdog remains healthy and `/api/readyz` stays `ready`. It also keeps Render awake (750 free hours/month allows 24/7 single-service execution).

### Backup Ticker: GitHub Actions (Every 5 minutes)
Workflow file: `.github/workflows/tick.yml`
- **Schedule:** `*/5 * * * *` (cron trigger) + `workflow_dispatch` (manual button).
- **Configuration (Repository Secrets):**
  - Go to GitHub Repo $\rightarrow$ **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
  - Add Secret `API_BASE_URL`: `https://<your-service>.onrender.com`
  - Add Secret `TICK_SECRET`: `<YOUR_TICK_SECRET>`
- **Important Limitations of GitHub Actions Ticker:**
  > [!WARNING]
  > GitHub Actions scheduled cron triggers run on shared public queues with best-effort timing. Under platform load, GitHub Actions runs can be delayed by 10 to 30+ minutes or dropped entirely. Because the watchdog threshold is 180 seconds, **GitHub Actions cannot guarantee continuous watchdog health on its own**. It is strictly a secondary keep-warm / backup mechanism when cron-job.org experiences downtime.

---

## 3. Rotate TICK_SECRET

When rotating `TICK_SECRET`:
1. Generate a new cryptographically secure 64-character secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Update Render:** In Render Dashboard $\rightarrow$ Environment $\rightarrow$ update `TICK_SECRET` and click **Save Changes** (triggers rolling deploy).
3. **Update cron-job.org:** Edit the cronjob header `X-Tick-Secret` with the new value.
4. **Update GitHub Actions:** In GitHub Repository Settings $\rightarrow$ Secrets $\rightarrow$ update `TICK_SECRET`.
5. **Verify:** Check Render logs or send a test request:
   ```bash
   curl -i -X POST "https://<your-service>.onrender.com/internal/tick" \
     -H "Content-Type: application/json" \
     -H "X-Tick-Secret: <NEW_SECRET>" \
     -d '{"source": "cron"}'
   ```
   Must return HTTP 200 `{ "status": "ok", ... }`.

---

## 4. Restore DB Backup & Migration

### Migrating Database on Clean Supabase Instance:
1. Export `DATABASE_URL` pointing to the target Supabase pooled database.
2. Apply all versioned migrations:
   ```bash
   pnpm db:migrate
   ```
3. Seed idempotent development/demo data:
   ```bash
   pnpm db:seed
   ```
4. Verify all 18 tables:
   ```bash
   node artifacts/api-server/dist/index.js
   curl http://localhost:3000/api/readyz
   ```

---

## 5. Demo Warm-up Routine (15 Minutes Before Stage)

*(TRD Section 17.1 checklist)*
1. **Check Readiness:**
   ```bash
   curl -s https://<your-service>.onrender.com/api/readyz
   ```
   Confirm:
   - `"status": "ready"`
   - `"database": "connected"`
   - `"watchdogTick": "ok"`
   - `"lastTickAgeSec"` is $\le 60$.
2. **Trigger Warm-up Tick:**
   If `lastTickAgeSec` is elevated (e.g. cold start), trigger immediate tick:
   ```bash
   curl -X POST https://<your-service>.onrender.com/internal/tick \
     -H "X-Tick-Secret: <SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"source": "in_process"}'
   ```
3. **Verify Liveness:**
   ```bash
   curl -s https://<your-service>.onrender.com/api/healthz
   ```
   Must return HTTP 200 `{ "status": "ok" }`.
4. **Confirm External Tickers Active:**
   - Check cron-job.org dashboard: last run green (HTTP 200).
   - Check GitHub Actions: `tick.yml` runs active.

---

## 6. Common Deployment Failures & Recovery

| Failure Symptom | Root Cause | Recovery Procedure |
|---|---|---|
| **Render Build Fails on TypeScript** | Out-of-order build or missing dist in monorepo | Ensure Render Build Command is `pnpm install --frozen-lockfile && pnpm build`. `@workspace/db` must build before `api-server`. |
| **Server Crashes on Startup: `Invalid environment variables`** | Missing `FIREBASE_SERVICE_ACCOUNT_JSON` or `DATABASE_URL` in production | Inspect Render Environment tab. Ensure JSON is valid single-line string and `DEV_AUTH_BYPASS` is set to `"false"`. |
| **`/api/readyz` returns 503 `database: disconnected`** | Supabase connection limit reached or pooled string misconfigured | Verify Supabase connection string uses port **6543** (Transaction pooler) and not port 5432. Check Supabase project status in dashboard. |
| **`/api/readyz` returns 503 `watchdogTick: degraded`** | cron-job.org paused or `TICK_SECRET` mismatch | Send manual tick curl with `X-Tick-Secret`. Check cron-job.org execution log for HTTP 401 errors. |
| **`/internal/tick` returns 401 `UNAUTHORIZED_TICK`** | Secret mismatch or missing header | Verify `X-Tick-Secret` header exactly matches `TICK_SECRET` in Render environment. |
| **HTTP 429 on `/internal/tick`** | Ticker frequency exceeded `tickLimiter` (12 ticks/min) | Check for duplicate cron jobs firing simultaneously. |
