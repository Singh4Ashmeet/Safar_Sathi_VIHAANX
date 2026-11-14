# Frontend Specification

> **Title**: Frontend Specification, UI Principles, Screen Navigation & Interaction Specs  
> **Source Sections**: Section 12 (Frontend specification, 12.1–12.6)  
> **Owner**: Dev B (Frontend) & Dev C (Integrator)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 12. Frontend specification

The app stays one-handed, light and never blocks on the network; this edition swaps the map layer to MapLibre and adds a "server waking up" state for the free host.

### 12.1 Principles

- **One-handed, large targets** ($\ge$ 48 dp), body text $\ge$ 16 sp, strong contrast, no tiny gray text on critical screens.
- **Light-weight:** avoid heavy animation and large images on low-end phones; lists use `FlatList`; limit map overlays.
- **Never block on the network.** Show cached data and a clear offline banner; queue actions.
- **No raw fetch for app data.** Use only the generated hooks from `@workspace/api-client-react` (section 16).
- **Maps use MapLibre** with the OpenFreeMap style and show the required attribution. No Google SDK and no API key in the bundle.
- **Keep the existing palette** (primary `#1E3A8A`, safe `#10B981`, warning `#F59E0B`, danger `#EF4444`); add a dark-friendly night theme as P1.

---

### 12.2 Navigation and screens

| Route | Screen | Key states | API |
| :--- | :--- | :--- | :--- |
| `/login`, `/signup` | Auth; signup requires 18+ and consent tick | loading, error, success | Firebase, `PUT /me` |
| `/onboarding` | Wizard: guardians (with channel choice), PINs, permissions (location always, notifications, battery optimisation, Bluetooth) | per-step done | `/guardians`, `/me` |
| `/` | Home: big SOS, Start Trip, Watch Me, Map, Ride check, Guardians | idle, trip active banner | `/me` |
| `/start-trip` | Destination search, route preview, ETA | searching, no route, offline, straight-line estimate | `/places/search`, `/routes`, `/trips` |
| `/trip` | Live trip: map, status chip, share link, end trip | safe, warning, danger, signal lost | `/trips/*` |
| `/prompt` | "Are you safe?" 20 s countdown, PIN pad | counting, expired | `/sos`, `/sos/{id}/cancel` |
| `/sos` | SOS active: delivery list per guardian and channel, live status, cancel with PIN | sending, delivered, acknowledged, failed | `/sos/*` |
| `/pin` | PIN pad used for cancel and duress (identical UI) | wrong, throttled | local plus `/sos/{id}/cancel` |
| `/guardians` | List, add, consent status, channel choice, remove | pending, granted | `/guardians` |
| `/watch` | Watch Me timer (server-owned) | idle, active, expired | `/watch` |
| `/map` | Safety map, day/night filter, report button | loading, empty | `/safety/*` |
| `/ride` | Enter plate and driver, share, plate-match prompt | | `/rides` |
| `/fake-call` | Realistic incoming call screen | | local |
| `/privacy` | Who can see me now, stop sharing, delete data | | `/me`, `/trips/*/share` |
| `/settings` | Language, discreet mode, relay toggle, tracking test | | `/me` |
| `/relay` | Mesh visualiser and relay status (demo) | sim or real | local |

---

### 12.3 Key interaction specs

- **SOS control:** press and hold 1.5 s with a visible ring fill and haptic ticks; release early cancels. A discreet alternative is shake $\times$3 while the app is open.
- **Cancel PIN vs duress PIN:** both lead to the same "Alert cancelled" screen. Only the request body differs (`pinKind`). A wrong PIN shows "Incorrect PIN" and throttles after 5 tries.
- **Prompt countdown is 20 s;** at 0 the app sends SOS with `trigger: 'prompt_timeout'`.
- **Delivery panel** shows each guardian with channel icons and statuses (queued, sent, failed, acknowledged); failures show a one-tap "Call guardian" and "Call 112".
- **Discreet mode:** neutral app labels in notifications, no sounds or flashing on the SOS-active screen, and a quick-exit button that returns to a calculator-style neutral screen.
- **Offline:** a top banner "No internet. SOS will use the relay if enabled" with the relay state; SOS taps are queued and retried.
- **Server waking up (new):** if the API has not answered within 5 s the banner reads "Connecting to safety server, this can take up to a minute" and the SOS keeps retrying with backoff. After 20 s without a server response the app offers the SMS-intent fallback to the guardians, and the user sees the "not delivered" state until the server confirms.

---

### 12.4 State and data

- **Server state:** TanStack Query with generated hooks (already installed).
- **Session:** AuthContext (Firebase); a token getter feeds the API client.
- **Local-first pieces:** SQLite outbox (locations, SOS), secure store (keys, PIN hashes), small settings store.
- **Shared logic from `@workspace/safety-core`:** risk engine, packet codec, crypto, relay engine, phone normalisation. The UI never reimplements these.

---

### 12.5 Localisation and accessibility

- `i18n/en.ts` and `i18n/hi.ts` with a `t(key)` helper; no hard-coded strings in screens.
- Phone input normalises to E.164 with +91 default and validates with zod.
- Screen-reader labels and roles on SOS, PIN pad and delivery status; reduced motion respected.

---

### 12.6 Frontend definition of done

The screen works on a 2 GB-RAM Android device, in airplane mode and on a slow network; strings come from `t()`; every network call uses a generated hook; loading, empty and error states exist; no secrets in the bundle.

