# Data Model (PostgreSQL via Drizzle)

> **Title**: Data Model (PostgreSQL via Drizzle), Storage Budget & Retention  
> **Source Sections**: Section 10 (Data model, Storage budget)  
> **Owner**: Dev A  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 10. Data model (PostgreSQL via Drizzle)

The schema is unchanged in spirit; new columns and three small tables support free channels, routing quotas and tick monitoring, and retention is shortened to fit Supabase's 500 MB.

| Table | Key columns | Notes |
| :--- | :--- | :--- |
| **users** | `id` (Firebase uid), `name`, `phone`, `lang`, `box_pub`, `sign_pub`, `expo_push_token`, `adult_confirmed_at`, `created_at` | Public keys only. Private keys never leave the device |
| **guardians** | `id`, `user_id`, `name`, `phone_e164`, `email?`, `relationship`, `channels` (text array: sms, telegram, email), `telegram_chat_id?`, `consent_status` (pending, granted, revoked), `guardian_user_id?`, `created_at` | Consent gates live-location access. New: channels, email, telegram_chat_id |
| **trips** | `id` (uuid), `user_id`, `destination`, `dest_lat/lng`, `route_polyline`, `status`, `started_at`, `eta_at`, `ended_at`, `last_seen_at`, `last_lat/lng`, `next_check_at`, `escalation_stage` | Watchdog state lives here |
| **trip_points** | `trip_id`, `ts`, `lat`, `lng`, `acc` | Unique on (`trip_id`, `ts`); retention policy applies |
| **share_links** | `token_hash`, `trip_id` or `sos_id`, `guardian_id?`, `expires_at`, `revoked_at` | Store only a hash of the token |
| **sos_events** | `id` (uuid), `user_id`, `trip_id?`, `trigger`, `duress`, `status` (active, acknowledged, resolved, cancelled), `source` (direct, ble_gateway), `gateway_device_hash?`, `created_at`, `received_at` | `source` shows how the alert reached us |
| **sos_deliveries** | `sos_id`, `guardian_id`, `channel` (push, sms, telegram, email), `status`, `provider_ref`, `updated_at` | Powers the delivery status UI |
| **sos_acks** | `sos_id`, `guardian_id`, `ack_at` | |
| **relay_packets** | `event_id` (pk), `raw`, `dest_tag`, `received_at`, `status` | Dedupe and forensic record |
| **watch_timers** | `id`, `user_id`, `ends_at`, `status` | Server-owned dead-man's switch |
| **escalations** | `trip_id` or `watch_id`, `stage`, `fired_at` | Unique key makes escalation idempotent |
| **rides** | `id`, `user_id`, `plate`, `driver_name`, `started_at`, `status` | |
| **zones** | `id`, `lat`, `lng`, `radius_m`, `category`, `severity`, `source` (seed, reports), `updated_at` | |
| **reports** | `id`, `lat`, `lng`, `category`, `note?`, `reporter_hash`, `status`, `created_at` | Rate-limited per reporter |
| **audit_log** | `id`, `actor`, `action`, `resource`, `ts` | Append-only |
| **tick_log (new)** | `id`, `received_at`, `source` (cron, github, in_process), `trips_checked` | Detects missed ticks and proves watchdog timing |
| **route_cache (new)** | `key` (origin cell, destination, hour bucket), `polyline`, `duration_sec`, `distance_m`, `created_at` | Keeps OpenRouteService calls under its daily quota |
| **quota_usage (new)** | `service`, `day`, `count` | Powers the quota guard in FR-16 |

---

### Storage budget

Supabase's free plan holds 500 MB. At one location point every 15 seconds a trip writes 240 points an hour; at an estimated 100–150 bytes per row including its index, 500 MB holds on the order of 10,000 trip-hours. To stay safe the free-tier defaults are:

- **trip points:** 7 days
- **relay raw packets:** 7 days
- **route cache:** 3 days
- **tick log:** 14 days
- **SOS records and audit logs:** kept 12 months because they are small.

A nightly cleanup runs from the same tick endpoint.

