# Backend Environment Variables Reference

> **Title**: Backend Environment Variables — Complete Reference  
> **Source Sections**: Section 16.3 (Environment variables), Section 8.2 (Technology decisions), .env.example  
> **Owner**: Dev A (Backend)  
> **Status**: Frozen  
> [← Back to Documentation Index](../README.md)

---

## Environment Variable Contract

No Google Maps key and no Twilio variables remain; nothing in the app bundle is a secret. All backend secrets live exclusively in environment variables and are listed in `.env.example` (committed). The `.env` file itself is git-ignored.

---

### Server Runtime

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. Dev-only auth bypass is disabled when `production` |
| `PORT` | No | `3000` | HTTP listener port |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS allow-list (e.g. `http://localhost:3000,http://localhost:8081`) |

---

### Database

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Yes (prod) | `postgres://postgres:postgres@localhost:5432/safarsaathi` | Supabase pooled Postgres connection string (IPv4). Do not use Supabase Auth, Storage, or Realtime — plain Postgres only via Drizzle |

---

### Firebase Authentication

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes (prod) | — | JSON string of the Firebase service-account credentials (free Spark plan). Used by `firebase-admin` to verify ID tokens. Never enable phone auth or Identity Platform (paid) |

---

### BLE Relay Encryption Keys

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `SERVER_BOX_SECRET_KEY` | Yes (relay) | — | X25519 private key (base64). Used to decrypt relay packets server-side via `tweetnacl` |
| `SERVER_BOX_PUBLIC_KEY` | Yes (relay) | — | X25519 public key (base64). Distributed to apps via `GET /me/relay-bundle` |

---

### SMS Provider

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `SMS_PROVIDER` | No | `console` | `console` (local/test simulation) or `android-gateway` (production spare phone) |
| `SMS_GATEWAY_URL` | When `android-gateway` | — | HTTP endpoint of the SMS Gateway for Android app (e.g. `http://192.168.1.100:8080` for LAN mode or a cloud-server URL) |
| `SMS_GATEWAY_USER` | When `android-gateway` | — | Basic-auth username for the gateway API |
| `SMS_GATEWAY_PASSWORD` | When `android-gateway` | — | Basic-auth password for the gateway API |
| `SMS_GATEWAY_PASSPHRASE` | Recommended | — | End-to-end encryption passphrase for the gateway app (T18: enable this to protect message text in transit to the gateway phone) |

---

### Telegram Bot

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | When Telegram enabled | — | Bot token from BotFather; used for guardian consent and SOS acknowledgement messages |
| `TELEGRAM_WEBHOOK_SECRET` | When Telegram enabled | — | Secret token header verified on `POST /integrations/telegram/webhook` (Telegram's `X-Telegram-Bot-Api-Secret-Token`) |

---

### Email (Free SMTP)

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `SMTP_URL` | When email enabled | — | SMTP connection URL (e.g. `smtp://user:pass@smtp.gmail.com:587` for Gmail app password, or Brevo free tier) |

---

### Routing & Geocoding (OpenRouteService)

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `ORS_API_KEY` | Yes (routing) | — | OpenRouteService free API key. Called only from the backend, never shipped in the app bundle. Free tier: 2,000 directions/day and 1,000 geocoding/day |
| `ROUTING_DAILY_LIMIT` | No | `1800` | Soft cap for the quota guard (FR-16). At this count the server stops new routing calls and serves cached or straight-line results. Set to ~90% of the vendor daily limit |

---

### Watchdog & Internal Tick

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `TICK_SECRET` | Yes | `safarsaathi_dev_tick_secret_replace_in_prod` | Shared secret for the `X-Tick-Secret` header on `POST /internal/tick`. Compared with constant-time compare (T20). Must be rotated from the default before production |
| `WATCHDOG_SIGNAL_LOST_SEC` | No | `180` | Seconds of silence before the watchdog sends "Are you okay?" push prompt (FR-05 signal-lost threshold) |
| `WATCHDOG_LOST_CONTACT_SEC` | No | `300` | Seconds after the prompt with no response before the watchdog alerts guardians (FR-05 lost-contact threshold) |
| `WATCHDOG_ETA_GRACE_SEC` | No | `600` | Seconds past ETA before the watchdog sends a check-in prompt (FR-05 ETA-overdue threshold) |

---

### Public URLs & Guardian Page

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `PUBLIC_BASE_URL` | Yes (prod) | `http://localhost:3000` | Base URL for building tracking links in SMS and Telegram messages (the free host URL, e.g. `https://safarsaathi-api.onrender.com`) |
| `GUARDIAN_TILE_URL` | No | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Raster tile URL template for the guardian Leaflet tracking page. Switchable if a tile provider throttles (L20, L21) |

---

### Data Retention

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `RETENTION_TRIP_POINTS_DAYS` | No | `7` | Trip points older than this are purged nightly by the cleanup worker. Shortened for Supabase's 500 MB free-tier budget |

