# Free-Tier Limits & Day-Zero Verification Tracker

> **Title**: Day-Zero Free-Tier Limits Verification Tracker  
> **Source Sections**: Free-stack changes at a glance, Section 7.4, Section 8.2, Section 15.3, Appendix C  
> **Owner**: All (Lead: Dev A & Dev C)  
> **Status**: Draft / Verification in progress (Day Zero)  
> [← Back to Documentation Index](README.md)

---

This document tracks the verification of free-tier quotas, terms, and fallbacks as required by the Day-Zero Checklist (section 15.3) and Appendix B (Definition of Done). Figures checked on 12 Nov 2026. Items marked with an asterisk (*) in the technical document must be re-checked before the hackathon clock starts.

### 1. API Hosting & Compute

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Render free web service** | Spins down after 15 min without traffic, ~1 min cold start, 750 free instance hours/month. Free Postgres expires after 30 days (do not use) | Render free-tier docs | Yes (checked 12 Nov 2026) | Team laptop plus Cloudflare quick tunnel* | |
| **Cloudflare quick tunnel\*** | Ad-hoc zero-cost HTTPS tunnel for local team demo laptop | General knowledge* | Not verified, check on day zero | Render deployment standing backup | |

---

### 2. Database

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Supabase free Postgres** | 500 MB storage cap, 50,000 monthly active users, 2 active projects; paused after 1 week of inactivity (ticker prevents pause) | Supabase pricing | Yes (checked 12 Nov 2026) | Nightly retention cleanup; export DB backup before demo | |

---

### 3. Identity & Authentication

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Auth (Spark plan)\*** | Email and password login on free Spark tier. Do not enable phone auth or upgrade to Identity Platform (paid) | Firebase Spark plan terms* | Not verified, check on day zero | Stay on free email/password login only | |

---

### 4. Alert Channels & SMS

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SMS Gateway for Android** | Open source (Apache-2.0); bounded by spare phone SIM's sending limits and plan; no sender ID | GitHub repo & docs | Yes (checked 12 Nov 2026) | User's native device SMS intent; parallel free channels (Telegram, email, WhatsApp link) | |
| **Telegram Bot API** | Free bot messaging, requires guardian to opt in via Telegram deep link | Telegram Bot API terms | Yes (checked 12 Nov 2026) | Web tracking link via SMS / Email | |
| **Free SMTP (Gmail / Brevo)\*** | Free SMTP email sending (e.g. Gmail app password or Brevo free tier limits) | Gmail / Brevo terms* | Not verified, check on day zero | Web tracking link via SMS / Push | |
| **Expo Push + FCM\*** | Free push notifications using FCM credentials on free Spark project | Expo docs / FCM terms* | Not verified, check on day zero | SMS link to guardian | |

---

### 5. Routing, Geocoding & Maps

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenRouteService Directions** | 2,000 directions/day, 40 calls/minute on standard free plan; commercial use not allowed on collaborative plan | OpenRouteService plans | Yes (checked 12 Nov 2026) | Quota guard (FR-16): cached routes, straight-line ETA fallback at 90% quota | |
| **OpenRouteService Geocoding** | 1,000 geocoding requests/day | OpenRouteService plans | Yes (checked 12 Nov 2026) | Nominatim geocoding fallback* (1 req/sec debounce) | |
| **Nominatim\*** | Free geocoding search; strict ~1 request/second usage policy | Nominatim policy* | Not verified, check on day zero | Debounce search input $\ge$ 500 ms; cached place lookups | |
| **OpenFreeMap** | Free public vector tiles, no key required, no request limit, donation-funded, no SLA | OpenFreeMap | Yes (checked 12 Nov 2026) | Switchable tile URL via environment variable | |
| **OpenStreetMap Raster Tiles\*** | Tile-usage policy for light web leaflet usage | OpenStreetMap tile-usage terms* | Not verified, check on day zero | Change `GUARDIAN_TILE_URL` to alternative free raster CDN | |
| **MapLibre React Native Plugin\*** | Expo SDK 54 config plugin support for `@maplibre/maplibre-react-native` | Expo plugin docs* | Not verified, check on day zero | Local prebuild Gradle scripts | |

---

### 6. Watchdog Clocks, CI & Monitoring

| Service | Limit | Source | Verified? | Fallback | Verified on |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **cron-job.org\*** | Free external HTTP ticker calling `/internal/tick` every 1 minute | cron-job.org* | Not verified, check on day zero | Secondary GitHub Actions scheduled ticker (every 5 min) + 15s in-process loop | |
| **GitHub Actions\*** | Free minutes on public repository for CI and 5-min backup cron trigger | GitHub Actions docs* | Not verified, check on day zero | Keep repository public; manual `workflow_dispatch` trigger | |
| **UptimeRobot\*** | 5-minute interval HTTP check on free plan for `/api/healthz` | UptimeRobot free terms* | Not verified, check on day zero | Platform logs & manual verification via `/api/readyz` | |
| **Expo EAS Build free plan** | Low-priority queue with small monthly build quota (sources differ on exact count) | Expo plans, EAS Build guide | Yes (checked 12 Nov 2026) | Local Android builds (`npx expo run:android`, Gradle release build) | |

