# Loopholes & Carry-Over Fixes

> **Title**: Loopholes & How We Tackle Them (L1–L21), Amendment A1 & 1.0 Carry-Over Fixes  
> **Source Sections**: Section 14 (Loopholes and how we tackle them, 14.1–14.2)  
> **Owner**: All (Lead: Dev A & Dev C)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 14. Loopholes and how we tackle them

Sixteen loopholes carry over and five new ones (L17–L21) come directly from relying on free tiers.

| # | Loophole | Why it is real | How we tackle it |
| :--- | :--- | :--- | :--- |
| **L1** | **Android kills background apps** (OEM battery savers on many budget phones) | Tracking silently stops | Foreground service plus an onboarding step that guides the user to exempt the app from battery optimisation; the server watchdog is the backstop, so protection does not rely on the app staying alive |
| **L2** | **iOS background limits** | BLE and long-running tracking are restricted, and iOS builds need a paid Apple programme | Android-first. iOS is out of scope for this build; stated openly |
| **L3** | **False alarms cause alert fatigue** | Guardians start ignoring alerts | Graduated response (prompt before alert), cancel flow, tuned thresholds, acknowledgements, a post-event "was this a false alarm?" feedback used to tune rules |
| **L4** | **Guardian does not see the alert** | Phone silent, asleep, busy | Multi-channel (push, SMS, Telegram, email), escalation ladder: if no acknowledgement in 2 minutes, re-alert the next guardian; final suggestion to call 112 |
| **L5** | **SMS delivery and DLT rules in India** | Messages from a gateway phone's SIM can be delayed or filtered, and bulk A2P SMS needs DLT registration | Free edition: gateway phone for the demo, push, Telegram, email and the link as parallel channels, per-guardian delivery status shown to the user. Start DLT registration right after the hackathon when a paid gateway becomes affordable |
| **L6** | **No relay phones nearby** | Relay value depends on density | Local queue and retry; last-gasp; watchdog fallback; focus launch on dense settings (campuses, events, transit hubs); honest messaging that relay is a bonus layer |
| **L7** | **Stalking misuse** | Safety tools can be turned into surveillance | Section 13, T1: consent, visibility, revocation, notifications, audit log |
| **L8** | **Battery drain** | Users uninstall | 15 s balanced-accuracy updates, adaptive slow-down when stationary in a low-risk area, relay duty cycling, a battery test as part of the Definition of Done |
| **L9** | **Offline clock drift** | Phone time may be wrong without network | Generous 24 h window; the server records its own `received_at`; GPS time preferred when a fix exists |
| **L10** | **Minors using the app** | Legal and safety obligations | 18+ confirmation at signup; a parental-consent flow is a later feature |
| **L11** | **Fake driver beyond plate check** | We cannot verify a plate against a registry | Ride verification is a prompt-based aid that shares details with guardians; aggregator integration is the real fix and is on the roadmap |
| **L12** | **Safety-map abuse and stigma** | False reports can defame a locality or target communities | Rate limits, minimum independent reports before a zone shows, decay over time, behaviour-based categories (lighting, harassment, isolation) and never community-based labels |
| **L13** | **Server outage during an emergency** | Single point of failure | Client retries with backoff, SMS fallback from the device (intent) when the API is unreachable, relay queue, and a visible "not delivered" state |
| **L14** | **User cannot reach the screen** | Real incidents are chaotic | Shake trigger, hold-to-trigger, watchdog, duress PIN, and a roadmap for wearable and BLE panic-button triggers |
| **L15** | **Demo failure risk** | Hackathon environment is hostile | Pre-seeded data, a demo-mode toggle, an APK on two spare phones, a recorded backup video, and a clearly labelled simulated mesh |
| **L16** | **Scope too large for 2.5 days** | Real risk | Priority matrix (section 5), cut-lines (section 17.3), stub-first integration, go/no-go spike for BLE |
| **L17** | **Free host spins down (new)** | Render's free web service sleeps after 15 minutes without traffic and takes about a minute to wake, which would delay an SOS or a check | Two external tickers keep it warm; the client retries with backoff and shows a "connecting" state; relay uploads retry for 2 minutes; the demo uses a warmed server or a laptop host |
| **L18** | **Free database pauses or fills (new)** | Supabase pauses idle free projects after a week and caps storage at 500 MB | Ticks keep the project active; retention is shortened; a daily size check; nightly cleanup; export a backup before the demo |
| **L19** | **Gateway phone is a single point of failure (new)** | It can run out of battery, lose signal, or be rate-limited by the operator | Keep it charging on Wi-Fi with a SIM that has an SMS pack; use a second spare phone as standby; the other free channels still fire; the delivery panel shows a failed SMS honestly |
| **L20** | **Free map or routing service is down or throttled (new)** | OpenFreeMap has no SLA; OpenRouteService caps daily calls | Cached routes, straight-line ETA, tile URL as configuration, and the safety features never depend on routing |
| **L21** | **Free-tier terms change (new)** | Vendors change limits, and this document's figures are dated 12 Nov 2026 | Re-check each limit on day zero (15.3); every dependency sits behind an interface (`SmsProvider`, tile URL, route provider) so a swap is a configuration change |

---

### 14.1 Spec amendment A1 (applied)

A stable sender tag lets observers link packets to one device, so the tag now rotates daily:
`senderTag = first 8 bytes of HMAC-SHA256(signPublicKey, epochDay)`.
The gateway keeps an indexed table of today's and yesterday's tags for registered users. This is already built into the packet layout in section 11.2 and supersedes the earlier fixed tag.

---

### 14.2 Carry-over fixes from the 1.0 analysis

| 1.0 problem | 2.0 disposition (free stack) |
| :--- | :--- |
| **Google API key in source** | Delete the key and purge git history; Google Maps is no longer used (T12) |
| **No Firestore rules in the repo** | Client stops using Firestore; rules deny-all |
| **Foreground-only tracking** | Background task plus outbox (8.5) |
| **Stop detection never fires when stationary** | Time-driven updates (`distanceInterval: 0`) plus the server watchdog |
| **Tracking stops on the emergency screen** | Tracking lives in a background service, not a screen |
| **SMS needs the user to press send; broken Android body URL** | The server sends SMS through the gateway phone; the local SMS intent remains only as a fallback and uses `Platform.OS` correctly |
| **`isFirebaseReady` stays false after late login** | Removed; the API client is always used, with a token getter |
| **Firebase Auth session may not persist** | Use `initializeAuth` with React Native AsyncStorage persistence |
| **Stale-closure contact writes** | Contacts managed through the API |
| **Demo buttons in production UI** | Behind a `demo_mode` flag |
| **Duplicate lockfiles** | Keep `pnpm-lock.yaml` only |

