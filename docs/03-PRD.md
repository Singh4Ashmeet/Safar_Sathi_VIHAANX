# Product Requirements Document (PRD)

> **Title**: Product Requirements Document (PRD)  
> **Source Sections**: Section 6 (PRD, Goals, Non-goals, FR-01..FR-16, NFRs, Core user flow, Success metrics)  
> **Owner**: All (Lead: Dev B / Dev A)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 6. Product Requirements Document (PRD)

The product must get help moving with one gesture, reach guardians with no app, and keep escalating when the user cannot act, all on a zero-cost stack.

### 6.1 Goals and non-goals

#### Goals
- **G1**: A user in danger can trigger help with one gesture, even discreetly.
- **G2**: Guardians are alerted within seconds with a live location, with or without a smartphone.
- **G3**: If the user cannot act (phone dead, snatched, app killed), the system still escalates.
- **G4**: If there is no network, an SOS can still reach a guardian through nearby phones.
- **G5**: The product works the same on a budget Android phone in a small town as on a flagship in a metro.
- **G6 (new)**: The whole system runs at ₹0 recurring cost, with every free-tier limit documented and monitored.

#### Non-goals for this build
- Replacing police or 112 response; we complement it with a one-tap call to 112.
- iOS parity (Android first; iOS builds need a paid Apple programme and are out of scope).
- AI or ML models; the risk engine stays rule-based and explainable.
- Monitoring minors; the product is 18+ at launch.
- Production-grade bulk SMS deliverability (needs a paid, DLT-registered gateway; see section 7.4).

---

### 6.2 Functional requirements

| ID | Requirement | Acceptance |
| :--- | :--- | :--- |
| **FR-01 Account and profile** | User signs up and logs in with email and password (Firebase Auth, free Spark plan). After login the app registers the profile, push token and public keys with the backend. | After login, `GET /v1/me` returns the profile; a user's data is never visible to another user. |
| **FR-02 Guardian circle** | 2–5 guardians per user, each with name, phone, relationship. Adding a guardian sends a consent message (SMS via the gateway phone, or a Telegram link if the guardian prefers). A guardian who has not consented receives SOS alerts only, never live location. | Guardians persist server-side; deleting a guardian immediately revokes all their links. |
| **FR-03 Safe Trip** | User picks a destination; the app fetches a route from OpenRouteService; the trip starts; location is sent in batches every 10–15 s (or on 20 m movement), including from the background. | With the phone locked for 5 minutes, the server still receives location points and the trip's last-seen time advances. |
| **FR-04 Share live link** | User can generate an expiring tracking link for a trip. It works in any browser without login and stops at trip end or expiry. | Link opens a map with the last location, updating at least every 10 s; revoked links show a clear "expired" page. |
| **FR-05 Server-side watchdog** | The ticker calls the server every minute; the server checks every active trip. Signal lost: no location for 3 min $\rightarrow$ push the user ("Are you okay?"). Lost contact: no response 5 min later $\rightarrow$ alert guardians with last known location. ETA overdue: trip not ended 10 min after ETA $\rightarrow$ check-in prompt, then escalate. Watch Me expiry: timer ends with no confirmation $\rightarrow$ alert guardians. All thresholds are configurable. | Kill the app mid-trip; guardians are alerted automatically within the configured window plus at most 60 s of ticker granularity. |
| **FR-06 SOS** | Triggers: on-screen SOS held for 1.5 s, shake $\times$3 (app active), and risk escalation timeout. The app generates a client UUID `sosId`, sends `POST /v1/sos`, and queues locally if offline; retries are idempotent. | SOS reaches all consenting guardians; a second delivery of the same `sosId` creates no duplicate. |
| **FR-07 Duress PIN and cancel** | User sets a cancel PIN and a duress PIN. The cancel PIN ends the alert normally. The duress PIN shows an identical "cancelled" screen but marks the SOS as duress and escalates silently. | The two PINs are visually indistinguishable; the server marks `duress=true` and keeps alerting. |
| **FR-08 Escalation and delivery** | Channels run in parallel: push (guardians with the app), SMS with link through the gateway phone, and each guardian's opted-in free channel (Telegram, email, WhatsApp link). Guardians tap "I'm on it" on the web page; the user sees acknowledgements. The user's lock-screen text is neutral ("Reminder"), never "SOS". | Every SOS shows per-guardian delivery status (queued, sent, failed, acknowledged). |
| **FR-09 Watch Me** | 15/30/45/60 min timer owned by the server so it fires even if the app is dead. | Timer expiry with the app closed alerts guardians. |
| **FR-10 Safety map** | Map shows crowd-sourced reports and seeded risk zones with a day/night filter, drawn with MapLibre and OpenFreeMap tiles. Users can submit a report (category, optional note) with abuse rate limits. | `GET /v1/safety/zones` returns zones within a radius; new reports appear after moderation rules apply. |
| **FR-11 Ride verification (P1)** | Before boarding, user enters or scans vehicle plate and driver name; the app shares them with guardians and prompts "Does the plate on the vehicle match?" at ride start. | Guardians see plate and driver; prompt appears at ride start. |
| **FR-12 BLE SOS relay (P1)** | See section 11. | An SOS created on phone A in airplane mode is delivered to the backend through phone B (the gateway), and the guardian receives the alert. |
| **FR-13 Language and accessibility** | English and Hindi UI; minimum 16 sp body text; tap targets $\ge$ 48 dp; high-contrast mode. | Checked in the accessibility pass. |
| **FR-14 Privacy center (P1)** | Shows who can currently see the user's location; one-tap stop-sharing; delete account and data. | Stop-sharing revokes links immediately; `DELETE /me` removes all data. |
| **FR-15 Free-channel fallback (new)** | If the SMS gateway phone is unreachable, the server marks SMS failed, tries the guardian's other free channels, and tells the user. The user's own phone may also send an SMS through the device SMS intent as a last resort. | With the gateway phone switched off, the guardian still receives the alert on another channel within 30 s and the user sees the failure. |
| **FR-16 Quota guard (new)** | The server counts calls to rate-limited free services (OpenRouteService) and degrades gracefully (cached route, straight-line ETA) before the daily cap. | At 90% of quota the server stops new routing calls and serves cached or straight-line results. |

---

### 6.3 Non-functional requirements

| Area | Target |
| :--- | :--- |
| **Alert latency** | SOS to guardian push/SMS handed off p95 < 10 s when the server is warm. After an idle spin-down the first request can take about a minute, so the ticker keeps the server warm and the client retries with backoff. |
| **Battery** | Tracking target under about 6% per hour, measured on a mid-range device. |
| **Data use** | Under about 200 bytes per location entry; works on 2G. |
| **Devices** | Android 8+, 2 GB RAM minimum. |
| **Availability** | Backend must survive a restart or spin-down without losing active trips (state in the database, not memory). |
| **Reliability** | Idempotent SOS, retries with backoff, local queue when offline. |
| **Cost** | ₹0 recurring cost; no credit card on any account; quotas reviewed daily during the build. |
| **Privacy** | No raw location in logs; share links expire; relays see only ciphertext. |
| **Accessibility** | Screen-reader labels on all SOS controls; works one-handed. |

---

### 6.4 Core user flow

1. User logs in, adds guardians, and they consent.
2. User starts a trip. The route is fetched, tracking starts in the background, and the server begins watching.
3. The risk engine or watchdog detects deviation, a long stop or silence. The user gets a 20-second "Are you safe?" prompt.
4. Safe PIN: de-escalate. No response, duress PIN or SOS press: escalate.
5. The server alerts guardians by push, SMS and free channels with a live link. Guardians acknowledge on the page.
6. User or guardian resolves the event. The trip record and optional report are saved.

---

### 6.5 Success metrics

- **Demo day**: end-to-end SOS delivered in under 10 s; watchdog fires with the app killed; BLE hop demonstrated (real or simulated, clearly labelled).
- **Post-hackathon**: time to first guardian alert, false-alarm rate, guardian acknowledgement rate, weekly active protected trips, 30-day retention.

