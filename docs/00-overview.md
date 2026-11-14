# Overview & Free-Stack Architecture

> **Title**: Overview, Executive Summary & The 5W1H  
> **Source Sections**: Document Header, Free-stack changes at a glance, Section 1 (Executive Summary), Section 2 (The 5W1H)  
> **Owner**: All (Lead: Dev C)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## SafarSaathi 2.0 — Product, Technical & Execution Document (Free-Stack Edition)

*Nov 12, 2026 · @ADITYA*

### Free-stack changes at a glance

Every paid or card-gated service in the earlier edition now has a free replacement; the table lists each swap and the limit to plan around. Vendor limits were checked on 12 Nov 2026 (links in Appendix C); items marked * come from general knowledge and must be re-confirmed in the day-zero checklist (section 15.3).

| Layer | Earlier edition | Free replacement | Limit to plan around |
| :--- | :--- | :--- | :--- |
| API hosting | Always-on VM, Railway or Render paid | Render free web service (no card) | Spins down after 15 min without traffic, ~1 min cold start, 750 free hours a month. A 1-minute external ticker keeps it warm. Fallback: team laptop plus a Cloudflare quick tunnel* |
| Watchdog clock | In-process timer on an always-on host | Free external ticker (cron-job.org*) calling a protected `/internal/tick` every minute | Escalation timing has up to 60 s granularity; state stays in Postgres so a restart loses nothing |
| Database | Replit or managed Postgres | Supabase free Postgres | 500 MB, 2 active projects, paused after 1 week of inactivity (the ticker prevents it). Do not use Render's free Postgres: it expires after 30 days |
| Identity | Firebase Auth | Firebase Auth email and password on the free Spark plan* | Do not enable phone auth or upgrade to Identity Platform (paid) |
| SMS to guardians | Twilio trial, then MSG91 with DLT | SMS Gateway for Android (open source, Apache-2.0) on a spare phone with a SIM we already own; user's own SMS intent as fallback; Telegram bot, email and WhatsApp click-to-chat link as free parallel channels | Sends from a normal SIM, so it is bounded by that SIM's SMS plan and operator limits. Fine for a demo, not a production-scale solution (section 7.4) |
| Push | Expo Push | Expo Push with Firebase Cloud Messaging credentials from the free Spark project* | None at hackathon volume |
| In-app maps | react-native-maps with Google key | MapLibre React Native with OpenFreeMap tiles | OpenFreeMap has no request limits and needs no key, but offers no search or routing |
| Routing and ETA | Google Directions | OpenRouteService free key | 2,000 directions and 1,000 geocoding requests a day; cache routes; straight-line fallback |
| Place search | Nominatim | OpenRouteService geocoding, Nominatim as fallback* | Debounce input; Nominatim allows about 1 request per second |
| Guardian web page | Leaflet with OSM tiles | Leaflet from a free CDN with OpenStreetMap raster tiles and a no-JavaScript text fallback | OSM tiles suit light use only, so the tile URL is an environment variable that can switch provider; MapLibre GL needs WebGL and would exclude low-end phones |
| App builds | EAS cloud builds | Local Android builds (`npx expo run:android`, Gradle release build) | Unlimited and queue-free. EAS free tier is a low-priority queue with a small monthly build quota; keep it as backup only |
| CI | Hosted CI | GitHub Actions on a public repository* | Keep the repo public, or stay inside the private-repo free minutes |
| Short domain | One fixed short domain | The host's free subdomain | Less phishing-resistant than an owned domain; buying one is a post-hackathon roadmap item |
| Distribution | Play Store | Signed APK shared over GitHub Releases or Drive | Sideloading only; fine for a hackathon |
| Monitoring | Paid uptime monitor | UptimeRobot free* plus platform logs | 5-minute checks on the free plan |
| Leaked Google key | Rotate and restrict | Delete it; no Google Maps key remains in the project | Remove it from git history too |

**What the free stack cannot do.** It cannot promise production-grade SMS deliverability, guaranteed zero cold starts, or iOS builds (Apple's developer programme is paid, so iOS is out of scope). These are stated again, honestly, in sections 7, 13 and 17.

---

## 1. Executive summary

SafarSaathi 2.0 is a women-safety platform whose protection keeps working when the phone, the network or the user's hands fail, and every layer of its stack now costs ₹0.

SafarSaathi 1.0 was a client-only demo. It tracked a trip, ran a rule-based risk engine on the phone and opened the SMS composer when something looked wrong. Tracking stopped when the app was backgrounded, alerts needed the user to press Send, nothing ran on a server, and an attacker who simply took the phone ended the protection.

Version 2.0 rests on three ideas:
1. **Resilient.** A server-side watchdog (dead-man's switch) escalates automatically when a trip goes silent. An offline BLE relay carries an encrypted SOS through nearby phones to a gateway phone that has internet.
2. **Discreet.** Silent triggers, a duress PIN that looks like a normal cancel but quietly escalates, and neutral notification text.
3. **Inclusive.** Guardians install nothing: they get an SMS with a live-tracking web link that works on a feature-phone browser and on 2G. The app targets low-end Android phones and ships in English and Hindi.

**The free-stack rule.** No paid service, no credit-card-gated service and no paid licence appears anywhere in this document. Where a paid tool was in the earlier edition (Twilio, Google Maps, Google Directions, Railway or Reserved VM hosting, EAS paid builds), it is replaced by a free alternative, and the limits of that alternative are stated openly. The one real compromise is SMS: reliable bulk SMS in India is inherently paid, so the free edition sends SMS through a spare Android phone running an open-source gateway app and falls back to free channels. Section 7 explains what changes when revenue exists.

**One-line pitch:** *"Your safety net that keeps working when your phone, your network, or your hands can't."*

**Hackathon reality check.** We have roughly 2.5 days and 3 people. Section 15 builds a walking skeleton by hour 8 with strict cut-lines. The BLE relay is the riskiest feature, so it sits behind a transport abstraction with a simulated-mesh fallback and a go/no-go gate.

---

## 2. The 5W1H

SafarSaathi serves women and guardians across all city tiers with a safety net that runs without a paid service anywhere in its stack.

| Question | Answer |
| :--- | :--- |
| **Who** | Primary users: women and girls aged 18+ across all city tiers: office commuters, college and hostel students, women in small towns relying on shared autos, solo travelers. Secondary users: guardians (family and friends, with or without smartphones). Institutional users: colleges, employers (POSH compliance), cab fleets, local administrations. |
| **What** | A safety platform with live trip protection, one-tap and silent SOS, a server-side dead-man's-switch watchdog, an offline BLE SOS relay, a crowdsourced safety map, ride verification, and a no-app guardian experience. |
| **Why** | Existing safety apps mostly assume a charged phone, a working network, and a user free to press buttons. Real incidents break all three assumptions. Women also face tech-enabled risks: fake-driver impersonation, tracker stalking, GPS spoofing, and phone snatching. |
| **When** | Before (plan route, verify ride, set guardians), during (tracking, check-ins, SOS), after (incident record, evidence, resolution). Peak use: late-night commutes, unfamiliar cities, ride-hailing, campus curfew travel, crowded events. |
| **Where** | India-wide, any tier. Designed for patchy 4G, 2G fallback, dead zones (highways, hills, basements), and congested networks (festivals, disasters). |
| **How** | A TypeScript-only stack in which every layer is free: Expo React Native dev build (built locally), Node/Express API on Render's free tier, Supabase free Postgres, Firebase Auth (Spark plan), Expo Push, SMS through an open-source Android gateway app on a spare phone, MapLibre with OpenFreeMap tiles and OpenRouteService for routing, a Leaflet web page for guardians, and a shared pure-TypeScript safety-core package for the risk engine, packet codec and crypto. |

