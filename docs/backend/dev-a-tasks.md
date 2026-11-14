# Dev A (Backend) Tasks & Phase Execution Plan

> **Title**: Dev A (Backend) Phase Plan & Tasks A1–A10  
> **Source Sections**: Section 15.1, Section 15.3, Section 15.5 (Timeline), Section 15.6 (Dev A Tasks)  
> **Owner**: Dev A (Backend)  
> **Status**: Frozen  
> [← Back to Documentation Index](../README.md)

---

## Dev A Role & Ownership

Dev A owns 100% of the backend: API server, database schema, watchdog worker and tick endpoint, notification dispatcher and SMS gateway integration, public guardian tracking page, relay gateway endpoint, free hosting setup, seed data, and server security. Dev A never touches app UI code.

---

## Tasks A1–A10 Master Table

*(Copied verbatim from Section 15.6)*

| # | Task | Deliverable and done when |
| :--- | :--- | :--- |
| **A1** | Schema and migrations for all tables in section 10, plus seed script | `pnpm db:migrate` and `pnpm db:seed` work on a clean Supabase database |
| **A2** | Auth middleware with `firebase-admin`; dev-only bypass header (disabled in production) | Protected routes return 401 without a valid token |
| **A3** | `/me`, `/guardians`, consent messages (SMS and Telegram link) | Guardian persists; consent status updates |
| **A4** | `/trips`, `/locations`, share link, `/t/{token}` page and public JSON | Page shows a live moving marker; revoked link shows "expired" |
| **A5** | notify module: `SmsProvider` (`console` and `android-gateway`), Expo push, Telegram, email, per-recipient delivery rows, retries and channel fallback | Delivery status visible via `GET /sos/{id}`; switching the gateway phone off still delivers on another channel |
| **A6** | `/sos` create (idempotent), cancel (cancel and duress), ack, escalation ladder | Duplicate POST creates one event; duress keeps alerting |
| **A7** | Watchdog worker with `SKIP LOCKED`, `/internal/tick`, boot-time catch-up, `/watch` | Kill the app: guardians alerted within the configured window |
| **A8** | `/safety/zones`, `/safety/reports`, `/rides`, `/routes` and `/places/search` with cache and quota guard | Seeded zones returned by radius; routes degrade to straight-line at quota |
| **A9** | `/relay/packets` and `/me/relay-bundle` using `safety-core` | Golden vectors decode; duplicate upload returns duplicate |
| **A10** | Hardening checklist 13.3, free hosting and tickers, `/readyz`, runbook | Checklist fully ticked; deployed URL stable; tick log shows steady ticks |

---

## Execution Phases for Dev A

### Phase 0: Day-zero setup (W0–W1.5 Kickoff & Day Zero Checklist)

- [ ] Agree scope (section 5), contract conventions (section 9), repo layout with Dev B and Dev C
- [ ] Firebase project on the free Spark plan; service-account JSON for the backend; client config unchanged
- [ ] Supabase free project; copy the pooled connection string and test it from the Render service
- [ ] Render free web service connected to the repo; public HTTPS URL noted
- [ ] cron-job.org job calling `/internal/tick` every minute with the secret header; GitHub Actions scheduled backup workflow; UptimeRobot monitor on `/api/healthz`
- [ ] OpenRouteService free API key stored in the backend environment
- [ ] Telegram bot created through BotFather; token and webhook secret in the environment
- [ ] SMS Gateway for Android installed on the spare phone from its GitHub releases; SMS permission granted, end-to-end passphrase set, battery optimisation off, phone on charge; credentials in the environment; test SMS to every demo number (with Dev C)
- [ ] Free-tier verification: re-read current limits for Render, Supabase, OpenRouteService, OpenFreeMap, SMS gateway app, cron-job.org, UptimeRobot, GitHub Actions and Firebase Spark in `docs/free-tier-limits.md`

### Phase 1: Foundation (W1.5–W4)

- [ ] **Task A1 (Schema & Migrations):** Schema and migrations for all tables in section 10, plus seed script. *(Done when: `pnpm db:migrate` and `pnpm db:seed` work on a clean Supabase database)*
- [ ] **Task A2 (Auth Middleware):** Auth middleware with `firebase-admin`; dev-only bypass header (disabled in production). *(Done when: Protected routes return 401 without a valid token)*
- [ ] Deploy the empty API on Render with `/healthz`
- [ ] Set up the two tickers (cron-job.org every 1 min, GitHub Actions every 5 min)
- [ ] *Milestone M1 at W4: Contract freeze v1*

### Phase 2: Walking skeleton (W4–W8)

- [ ] **Task A3 (Profile & Guardians):** `/me`, `/guardians`, consent messages (SMS and Telegram link). *(Done when: Guardian persists; consent status updates)*
- [ ] **Task A4 (Trips & Tracking):** `/trips`, `/locations`, share link, `/t/{token}` page and public JSON. *(Done when: Page shows a live moving marker; revoked link shows "expired")*
- [ ] *Milestone M2 at W8: Walking skeleton (Login $\rightarrow$ add guardian $\rightarrow$ start trip $\rightarrow$ points reach server $\rightarrow$ guardian web page shows a moving dot. First full merge window)*

### Phase 3: SOS, notify, watchdog v1 (W8–W14)

- [ ] **Task A5 (Notify Module):** notify module: `SmsProvider` (`console` and `android-gateway`), Expo push, Telegram, email, per-recipient delivery rows, retries and channel fallback. *(Done when: Delivery status visible via `GET /sos/{id}`; switching the gateway phone off still delivers on another channel)*
- [ ] **Task A6 (SOS Flow):** `/sos` create (idempotent), cancel (cancel and duress), ack, escalation ladder. *(Done when: Duplicate POST creates one event; duress keeps alerting)*
- [ ] Watchdog v1 with the tick endpoint
- [ ] *Day 1 ends: tag `v0.1-p0-core` (SOS works online end to end)*

### Phase 4: Watchdog complete, Watch Me, safety, rides (W14–W20)

- [ ] **Task A7 (Watchdog Complete):** Watchdog worker with `SKIP LOCKED`, `/internal/tick`, boot-time catch-up, `/watch`. *(Done when: Kill the app: guardians alerted within the configured window)*
- [ ] **Task A8 (Safety, Rides & Routing):** `/safety/zones`, `/safety/reports`, `/rides`, `/routes` and `/places/search` with cache and quota guard. *(Done when: Seeded zones returned by radius; routes degrade to straight-line at quota)*
- [ ] *Milestone M3 at W20: P0 feature complete (Full integration test on two physical phones: IT-1 to IT-7)*

### Phase 5: Relay gateway + hardening (W20–W28)

- [ ] **Task A9 (Relay Gateway):** `/relay/packets` and `/me/relay-bundle` using `safety-core`. *(Done when: Golden vectors decode; duplicate upload returns duplicate)*
- [ ] Rate limits and security checklist 13.3 implementation
- [ ] *Milestone M4 at W28: Feature freeze (Only bug fixes, performance and polish from here)*

### Phase 6: Release + demo readiness (W28–W36)

- [ ] **Task A10 (Hardening & Runbook):** Hardening checklist 13.3, free hosting and tickers, `/readyz`, runbook. *(Done when: Checklist fully ticked; deployed URL stable; tick log shows steady ticks)*
- [ ] Pre-populate seed data, runbook completion, final deploy, logs check, load sanity test, database backup export
- [ ] *Milestone M5 at W36: Release candidate (APK installed on demo phones; rehearsal $\times$3; submission assets)*
- [ ] *W36–W40: Standby for hotfixes & final rehearsal*

