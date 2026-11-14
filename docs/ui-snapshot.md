# SafarSaathi UI Snapshot

> **Generated:** 2026-11-13  
> **App Version:** 2.0 (Free-Stack Edition)  
> **Platform:** React Native / Expo Router

---

## Table of Contents

1. [App Architecture Overview](#app-architecture-overview)
2. [Navigation Structure](#navigation-structure)
3. [Screen Inventory](#screen-inventory)
4. [Component Library](#component-library)
5. [Design System](#design-system)
6. [Key User Flows](#key-user-flows)

---

## App Architecture Overview

SafarSaathi is a React Native safety application built with **Expo Router** (file-based routing). The app uses a **tab-based navigation** with 5 main tabs:

| Tab | Route | Icon | Description |
|-----|-------|------|-------------|
| Home | `/` | `home` | Dashboard with SOS, trip start, features grid |
| Map | `/map` | `map` | Safety map with community reports |
| Circle | `/guardians` | `users` | Guardian management |
| Trip | `/trip` | `navigation` | Live trip tracking (conditional) |
| Profile | `/settings` | `user` | Settings, privacy, account |

**Entry Point:** `/app/_layout.tsx` — defines stack + tabs, auth guards, and global providers.

---

## Navigation Structure

```
_app_layout.tsx (Stack)
├── Auth Stack (when not authenticated)
│   ├── /login
│   ├── /signup
│   └── /onboarding (after signup)
│
├── Main App Stack (when authenticated)
│   ├── Tabs
│   │   ├── / (Home)
│   │   ├── /map (Safety Map)
│   │   ├── /guardians (Guardian Circle)
│   │   ├── /trip (Live Trip - conditional)
│   │   └── /settings (Profile/Settings)
│   │
│   ├── Modal/Stack Screens
│   │   ├── /start-trip
│   │   ├── /watch (Watch Me)
│   │   ├── /ride (Ride Check)
│   │   ├── /sos (Active SOS)
│   │   ├── /pin (PIN Entry)
│   │   ├── /prompt (Safety Check-in Prompt)
│   │   ├── /relay (BLE Mesh Relay)
│   │   ├── /calculator (Discreet Quick-Exit)
│   │   ├── /fake-call (Fake Incoming Call)
│   │   ├── /privacy (Privacy Centre)
│   │   └── /ui-kit (Component Showcase)
```

---

## Screen Inventory

### 1. Home Screen (`/app/index.tsx`)

**Purpose:** Main dashboard — central hub for all safety features.

**Layout:**
- **Header:** "YOUR SAFETY SPACE" title + "Ready" status badge (green pulsing dot)
- **Offline Banner:** Yellow warning when offline (conditional)
- **Active Trip Banner:** Green banner showing destination if trip active (navigates to `/trip`)
- **SOS Card:** Large circular SOS button (hold 1.5s) + footnote "Emergency flow preview · Demo only"
- **2×2 Feature Grid:**
  - **Start Safe Trip** → `/start-trip` (GPS icon, lavender)
  - **Watch Me** → `/watch` (Clock icon, amber)
  - **Safety Map** → `/map` (Rhombus icon, green)
  - **Ride Check** → `/ride` (Card icon, violet)
- **Guardian Circle Preview:** Shows 2 avatar bubbles (M, A) + "2 guardians added" + "View all →" link to `/guardians`
- **Discreet Mode Toggle:** Switch with label "Discreet mode / Subtle app appearance"
- **Bottom Navigation:** Fixed BottomNav component

**Key Interactions:**
- Shake-to-SOS trigger (via `useShakeSosTrigger`)
- SOS button hold → navigates to `/sos` with `sosId`
- Tap active trip banner → `/trip`
- Tap feature grid items → respective screens
- Guardian "View all" → `/guardians`

---

### 2. Safety Map (`/app/map.tsx`)

**Purpose:** Explore safety zones, submit community reports.

**Layout:**
- **BrandHeader:** Title + "Demo mode" badge
- **Screen Title:** "Safety map" + subtitle
- **Explore Areas Card:**
  - Header: "Explore areas" + "Sample data" badge
  - **Filter Pills:** Day view / Night view / All reports (toggle)
  - **Map Preview:** `SafetyMapView` component (180px height) with center coordinates, night mode toggle, route points overlay
  - Watermark: "Illustrative map · Demo only"
  - Caption: Dynamic text based on filter
- **Community Safety Notes Card:**
  - Title: "Community safety notes"
  - Subtitle: "View example reports or add a sample location note."
  - **Report a Place Button:** Opens bottom sheet modal
- **Report Modal (Bottom Sheet):**
  - Title: "Report a Place" + close X
  - Category picker: 5 categories (Poor lighting, Harassment, Isolation, Theft/Snatch, Patrolled)
  - Optional note textarea
  - Submit button / Success message
- **Bottom Navigation**

**Key Interactions:**
- GPS permission request on mount
- Filter pills update `useListSafetyZones` query
- Report modal submits via `useSubmitSafetyReport` mutation

---

### 3. Active SOS Screen (`/app/sos.tsx`)

**Purpose:** Live emergency alert status with delivery tracking.

**Layout:**
- **Header:**
  - Pulsing red alert icon + Title: "EMERGENCY SOS ACTIVE" (or "Discreet Alert Active" in discreet mode)
  - Subtitle: "Alert broadcasts dispatched to guardians"
  - Quick Exit button (discreet mode only) → `/calculator`
- **Offline Banner**
- **Sending State Box (conditional):** "Alert not yet delivered" + "Send via SMS fallback" button
- **Status Card:**
  - Section label: "Live Status: [STATUS]" + "· via BLE Mesh Relay" if relay
  - **Delivery Rows:** `DeliveryRow` components for each guardian showing:
    - Guardian name, channel (SMS/Push/Telegram), status (DISPATCHED/DELIVERED/FAILED)
    - Call guardian / Call 112 buttons per row
  - **Demo Fallback:** Static rows for "Mom (SMS · Push) — DISPATCHED" and "Aanya (SMS · Telegram) — DELIVERED"
- **Actions:**
  - **Call 112 Police:** Deep red button with phone icon → `tel:112`
  - **Deactivate With Safety PIN:** Outlined button → `/pin?sosId=...`
- **Bottom Navigation** (activeTab: home)

---

### 4. Watch Me (`/app/watch.tsx`)

**Purpose:** Timed safety check-in sessions.

**Layout:**
- **Top Bar:** Back button + "Watch Me" title
- **Offline Banner**
- **Two States:**
  
  **A. No Active Session:**
  - Card: "Start a Timed Safety Session" + description
  - **Preset Grid (2×2):** 15 / 30 / 45 / 60 minute buttons (amber numbers)
  
  **B. Active Session:**
  - Timer Card with clock icon (amber)
  - Title: "Active Safety Session"
  - Description: "If you don't confirm you're safe before the countdown finishes, guardians will be alerted."
  - **Large Timer Display:** MM:SS in amber (48pt)
  - **Confirm Safe Button:** Green full-width "I Am Safe · End Session"

- **Bottom Navigation**

**Key Interactions:**
- Start session → calls `startWatchMe` API, sets `activeWatchId` and `endsAt`
- Countdown timer updates every second
- Confirm safe → calls `confirmWatchMe` API, clears session

---

### 5. Start Safe Trip (`/app/start-trip.tsx`)

**Purpose:** Plan route, preview journey, begin protected trip.

**Layout:**
- **Screen Title:** "Start a safe trip" + subtitle
- **Offline Banner**
- **Destination Details Card:**
  - Eyebrow: "DESTINATION DETAILS"
  - **Destination Input:** Autocomplete search (`searchPlaces` API) with results dropdown
  - **Starting Point Input:** Text field (default "My current location")
  - **Stats Row:** Estimated distance (km) + Estimated arrival (mins, green)
  - **Begin Protected Trip Button:** Violet CTA, loading state
- **Route Preview Card:**
  - Header: "Route preview" + "Sample route" badge
  - **Map Container:** `SafetyMapView` with origin, route polyline, destination marker
  - Watermark: "Illustrative map · Demo only"
- **Bottom Navigation** (activeTab: trip)

**Key Interactions:**
- GPS permission + current location on mount
- Debounced place search (400ms)
- Place selection → `computeRoute` API → decodes polyline, updates map
- Start trip → `createTrip` API → `startProtectedTrip` context → navigates to `/trip`

---

### 6. Ride Check (`/app/ride.tsx`)

**Purpose:** Verify vehicle/driver details before boarding.

**Layout:**
- **Top Bar:** Back button + "Ride Check" title
- **Card:** "Verify Vehicle & Driver" + description
- **Ride Provider Pills:** Uber / Ola / Rapido / Auto / Private Vehicle (horizontal scroll)
- **Vehicle License Plate Input:** Auto-capitalize, placeholder "DL 01 AB 1234"
- **Driver Name Input:** Optional
- **Share Ride With Guardians Button:** Violet CTA → calls `useRegisterRide` mutation
- **Verification Card (after registration):**
  - Shield icon + "Boarding Verification"
  - Question: "Does the physical plate match [PLATE]?"
  - **Choice Row:** "Yes, Matches" (green) / "No · Alert!" (red → triggers SOS)
  - **Confirmed State:** Green check + "Plate verified. Trip details linked to your guardians."
- **Bottom Navigation**

---

### 7. Live Trip (`/app/trip.tsx`)

**Purpose:** Real-time trip tracking with live map and controls.

**Layout:**
- **Header:** Back button + `StatusChip` (safe/warning/danger/signal_lost based on tracking + risk)
- **Offline Banner**
- **Full-Screen Map:** `SafetyMapView` with live GPS center, route polyline, destination marker
  - Watermark: "Active Live Trip · Encrypted Tracking"
- **Bottom Control Panel (Card):**
  - Destination title
  - Meta: "GPS Fixes: X pending · Fix updated Ys ago"
  - Share Link Display (if active): Green text with URL
  - **Actions Row:**
    - Share/Stop Sharing Button: Toggle icon (share-2 / eye-off) + label
    - End Safe Trip Button: Green outlined "End Safe Trip"
  - **SOS Row:**
    - `SOSButton` (88px)
    - Demo: "Test Check-in Prompt" button (amber) → `/prompt`
- **Bottom Navigation** (activeTab: trip)

**Key Interactions:**
- Live tracking via `useTrackingStatus` + `useRiskState`
- Share link creates/revokes via `createTripShareLink` / `revokeTripShareLinks`
- End trip → `endTrip` API + `stopProtectedTrip` context → navigate to `/`

---

### 8. Guardian Circle (`/app/guardians.tsx`)

**Purpose:** Manage trusted contacts for emergency alerts.

**Layout:**
- **BrandHeader** + "Demo mode" badge
- **Title:** "Your guardian circle" + subtitle
- **Guardians Card:**
  - Header: "YOUR GUARDIANS" + "+ Add guardian" button
  - **List:** Each guardian row:
    - Avatar bubble (initial, dark bg, lavender text)
    - Name + "Relationship · Demo contact"
    - "Active" pill (green dot + text)
    - Long-press → remove confirmation
  - Demo fallback: Mom (Family, SMS+Telegram) + Aanya (Friend, SMS+Email)
- **How Guardian Sharing Works Card:**
  - Description
  - "Alert preferences" button → opens modal
- **Add Guardian Modal (Bottom Sheet):**
  - Name, Phone (+91), Relationship inputs
  - Save button
- **Alert Preferences Modal (Bottom Sheet):**
  - 3 Switches: Share live location on SOS, Include battery %, Emergency SMS fallback
  - Save button
- **Bottom Navigation** (activeTab: circle)

---

### 9. Discreet Quick-Exit Calculator (`/app/calculator.tsx`)

**Purpose:** Innocent-looking calculator; long-press "=" returns to home.

**Layout:**
- Full-screen calculator UI
- Display: Expression/result (48pt, right-aligned)
- 4×4 Keypad: 7 8 9 / | 4 5 6 * | 1 2 3 - | C 0 = +
- **Long-press "="** → `router.replace('/')`
- Standard calculator logic (eval with sanitization)

---

### 10. Fake Incoming Call (`/app/fake-call.tsx`)

**Purpose:** Simulated incoming call for discreet exit from uncomfortable situations.

**Layout:**
- Vibrating + haptic feedback on mount
- **Incoming State:**
  - "Incoming mobile call"
  - Caller: "Mom" (large)
  - Phone: "+91 98765 •••••"
  - Buttons: Decline (red) / Accept (green)
- **Answered State:**
  - Timer: MM:SS
  - Caller name
  - End button (red)
- **Back navigation** on decline/end

---

### 11. Login (`/app/login.tsx`)

**Purpose:** Email/password authentication.

**Layout:**
- **Brand Row:** Logo badge (violet star) + "SafarSaathi" (Saathi in lavender)
- **Title:** "Welcome back" + "Your personal travel safety companion"
- **Error Box:** Red if login fails
- **Email Input:** Keyboard email, placeholder
- **Password Input:** Secure, placeholder
- **BigButton:** "Log In" (primary variant)
- **Quick Demo Access:** Outlined button → logs in as `student@safarsaathi.in`
- **Link:** "New to SafarSaathi? Create account" → `/signup`
- **KeyboardAwareScrollView** for input focus

---

### 12. Signup (`/app/signup.tsx`)

**Purpose:** Account creation with profile setup.

**Layout:**
- **Brand Row** (same as login)
- **Title:** "Create account" + "Join SafarSaathi safety network"
- **Error Box**
- **Inputs:** Full Name, Phone, Email, Password (secure, 6+ chars)
- **Consent Checkbox:** "I confirm that I am 18+ years of age and agree to travel emergency sharing terms."
- **BigButton:** "Create Account & Setup"
- **Link:** "Already have an account? Log in" → `/login`
- **On Success:** Generates device keys → `upsertMe` profile → navigates to `/onboarding`

---

### 13. Onboarding (`/app/onboarding.tsx`)

**Purpose:** 3-step safety setup wizard.

**Layout:**
- **Progress Title:** "Safety Setup (X/3)"
- **Step 1 — Cancel & Duress PINs:**
  - Explanation of Safe Cancel PIN vs Silent Duress PIN
  - Two secure PIN inputs (4-6 digits, must differ)
  - "Save PINs & Continue" button
- **Step 2 — Background Permissions:**
  - Explanation
  - "Grant Location & Notifications" button (safe variant)
  - "Open System Battery Settings" button (secondary)
  - "Next: Setup Guardians" button
- **Step 3 — Trusted Guardians:**
  - Explanation
  - "Open Guardians Circle" → `/guardians`
  - "Complete & Go to Home" (secondary) → `/`
- Card-based layout with consistent styling

---

### 14. PIN Entry (`/app/pin.tsx`)

**Purpose:** Verify Safety Cancel PIN or Silent Duress PIN to deactivate SOS.

**Layout:**
- **Back Button** (← Back)
- **Title:** "Enter PIN to cancel alert"
- **Error Message** (red)
- **PinPad Component:** 3×4 numeric keypad with submit
- **Locked State:** Disabled after throttling
- **Success State (identical for both PINs):** Green checkmark + "Alert Cancelled" + "Your guardians have been notified..." + "Back to Home" button
- **FR-07 Compliance:** Visual identical screen for both cancel and duress; duress silently escalates

---

### 15. Privacy Centre (`/app/privacy.tsx`)

**Purpose:** Data control, sharing management, account deletion.

**Layout:**
- **Top Bar:** Back + "Privacy Centre"
- **Card 1: Who Can See My Location**
  - Active share banner (if `shareUrl`): Green radio + URL
  - Consented Guardians list (name + relationship)
  - "One-Tap Stop All Sharing" button (outlined) → revokes links
- **Card 2: Zero-Knowledge & Retention Policy**
  - Bullet points: 7-day GPS expiry, BLE E2E encryption, salt-hashed contacts
  - "Delete All Account & Trip Data" button (red outlined) → confirmation alert → `deleteMe` + `clearAllSecureData` + `logout`
- **Bottom Navigation** (activeTab: profile)

---

### 16. Safety Check-in Prompt (`/app/prompt.tsx`)

**Purpose:** Timed challenge requiring PIN entry to confirm safety.

**Layout:**
- **Title:** "Are you safe?"
- **Subtitle:** "A route anomaly or scheduled check-in was triggered. Enter your safety PIN to confirm."
- **Countdown Timer:** Large amber number in warning box (20s → 0)
- **Error Message** (red)
- **PinPad Component**
- **On Timeout:** Triggers SOS → navigates to `/sos`
- **On Cancel PIN:** Navigates to `/`
- **On Duress PIN:** Triggers SOS → navigates to `/pin?completedDuress=1` (shows "Alert Cancelled" but silently escalates)

---

### 17. BLE Mesh Relay (`/app/relay.tsx`)

**Purpose:** Opt-in offline SOS forwarding via nearby devices.

**Layout:**
- **Top Bar:** Back + "BLE SOS Mesh Relay"
- **Card 1: Mesh Forwarding Toggle**
  - Switch: Enable/disable mesh forwarding
  - Stats: "Nearby Peers: X · Queued: Y · Forwarded: Z"
- **Card 2: Mesh Visualiser (Demo)**
  - 3-node diagram: Phone A (Offline SOS, red) → Peer B (BLE Relay, amber) → Gateway C (Internet, green)
  - "Simulate Multi-Hop BLE Broadcast" button
  - **Log Console:** Real-time log lines showing packet flow
- **Bottom Navigation**

---

### 18. Settings / Your Space (`/app/settings.tsx`)

**Purpose:** App preferences, language, permissions, account.

**Layout:**
- **BrandHeader**
- **Title:** "Your space" + subtitle
- **Settings Card:**
  - **Discreet Mode:** Switch + label/subtitle
  - **Language:** Dropdown → Modal (English / हिन्दी)
  - **Permissions:** "Review" button → Modal (Location, Notifications, BLE status)
  - **Privacy Centre:** "Open" button → `/privacy`
- **About Card:** "About SafarSaathi" + version
- **Account Card:**
  - "Signed in as" + email
  - "Log Out" button (red outlined)
- **Bottom Navigation** (activeTab: profile)

---

### 19. UI Kit Showcase (`/app/ui-kit.tsx`)

**Purpose:** Component library reference screen.

**Components Displayed:**
- `StatusChip`: safe / warning (score 45) / danger (score 85) / signal_lost
- `BigButton`: primary / safe / danger / secondary variants
- `SOSButton`: 120px demo
- `DeliveryRow`: SMS sent / Telegram failed (with call buttons)
- `PinPad`: Interactive demo

---

## Component Library

### Core UI Components (`/artifacts/safarsaathi/components/`)

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `SOSButton` | Hold-to-trigger emergency | `onTrigger`, `size` (default 164) |
| `StatusChip` | Risk/signal status indicator | `status`: 'safe'\|'warning'\|'danger'\|'signal_lost', `score?` |
| `BigButton` | Primary action buttons | `label`, `variant`: 'primary'\|'safe'\|'danger'\|'secondary', `loading?` |
| `PinPad` | 4-6 digit PIN entry | `value`, `onChange`, `onSubmit`, `disabled?` |
| `DeliveryRow` | Guardian delivery status | `guardianName`, `channel`, `status`, `onCallGuardian?`, `onCall112?` |
| `OfflineBanner` | Network status warning | Auto-shows when offline |
| `BrandHeader` | Top bar with title + badge | `rightBadgeText?` |
| `BottomNav` | Fixed 5-tab navigation | `activeTab` |
| `SafetyMapView` | Map visualization | `center`, `routePoints?`, `destination?`, `nightMode?` |
| `Card` | Consistent card wrapper | `style?`, `children` |
| `StatusBadge` | Small status label | `status`, `children` |
| `RiskAlertDialog` | Risk level modal | `riskLevel`, `onDismiss` |

### Context Providers (`/artifacts/safarsaathi/context/`)

- **AuthContext:** `user`, `login`, `signup`, `logout`, `isLoading`
- **TripContext:** `activeTrip`, `activeSosId`, `activeWatchId`, `routePoints`, `shareUrl`, `discreetMode`, `startProtectedTrip`, `stopProtectedTrip`, `setActiveWatchId`, `setShareUrl`, `triggerSosFlow`, `setDiscreetMode`

### Services (`/artifacts/safarsaathi/services/`)

- `sos.ts`: `useSosStatus`, `useShakeSosTrigger`, `openDeviceSmsFallback`
- `pin.ts`: `set`, `verify` (cancel/duress/throttled), SecureStore
- `relay.ts`: `useRelayStatus`, `setEnabled`, `broadcastOfflineSosPacket`, SimTransport
- `tracking.ts`: `useTrackingStatus`, `getLatestLocation`
- `risk.ts`: `useRiskState`
- `secure.ts`: `ensureDeviceKeys`, `generateUuidV4`, `clearAllSecureData`
- `activityLog.ts`: Local activity logging

---

## Design System

### Colors (`/artifacts/safarsaathi/constants/colors.ts`)

```typescript
Palette = {
  // Backgrounds
  mainBackground: '#06080F',        // Near-black
  cardBackground: '#0E111A',        // Dark card
  insetSurfaces: '#151926',         // Input/map backgrounds
  
  // Text
  primaryText: '#F5F5F7',           // White
  secondaryText: '#9BA3B8',         // Muted gray
  mutedText: '#6B7280',             // Subtle gray
  
  // Brand
  primaryViolet: '#635BFF',         // Primary action
  softLavender: '#B8B4FF',          // Accent/highlight
  
  // Semantic
  successGreen: '#00B887',          // Safe, confirmed
  warningAmber: '#E89B15',          // Caution, timer
  sosRed: '#F13C5C',                // Emergency
  deepSosRed: '#C62828',            // Call 112 button
  
  // Borders
  borders: '#1E2436',               // Card borders
}
```

### Typography

- **Font Family:** Inter (weights: 400, 500, 600, 700, 800)
- **Scale:**
  - Display: 28-32pt, 800 weight
  - Title: 18-22pt, 700 weight
  - Body: 14-16pt, 400-500 weight
  - Caption: 12-13pt, 500-600 weight
  - Button: 14-16pt, 700 weight
  - Timer: 40-48pt, 800 weight

### Spacing & Radius

- **Base Unit:** 4px
- **Card Radius:** 20-22px
- **Button Radius:** 12-16px
- **Pill Radius:** 20px
- **Avatar Radius:** 50% (circle)
- **Gap:** 8-16px between elements

### Shadows & Elevation

- **Primary CTA:** `shadowColor: primaryViolet`, `offset: 0,4`, `opacity: 0.35`, `radius: 10`, `elevation: 6`
- **SOS Red:** `shadowColor: deepSosRed`, same offset/opacity
- **Cards:** Border-only (1px, `borders` color)

### Dark Mode Only

The app uses a **dark-only** color scheme optimized for low-light safety scenarios.

---

## Key User Flows

### 1. Emergency SOS Activation
```
Home → [Hold SOS 1.5s] → /sos (Active SOS)
  → [Call 112] → tel:112
  → [Deactivate] → /pin?sosId=...
    → [Enter Cancel PIN] → "Alert Cancelled" → Home
    → [Enter Duress PIN] → "Alert Cancelled" (silent escalation) → Home
```

### 2. Start Protected Trip
```
Home → [Start Safe Trip] → /start-trip
  → [Search Destination] → [Select Place] → [Compute Route]
  → [Begin Protected Trip] → /trip (Live Trip)
    → [Share Live Link] → Creates share URL
    → [End Safe Trip] → API + Context → Home
```

### 3. Watch Me Session
```
Home → [Watch Me] → /watch
  → [Select Duration] → Active Timer (countdown)
  → [I Am Safe] → Confirm → Session Ends
  → [Timeout] → Auto-triggers SOS
```

### 4. Ride Verification
```
Home → [Ride Check] → /ride
  → [Select Provider] → [Enter Plate] → [Optional Driver]
  → [Share Ride] → Verification Card
  → [Yes, Matches] → Confirmed
  → [No · Alert!] → Triggers SOS → /sos
```

### 5. Safety Check-in Prompt
```
Background trigger (anomaly/timer) → /prompt
  → [20s Countdown] + PinPad
  → [Cancel PIN] → Home
  → [Duress PIN] → Silent SOS + "Alert Cancelled" screen
  → [Timeout] → Auto SOS → /sos
```

### 6. Guardian Management
```
Home → [Guardian Circle] → /guardians
  → [+ Add Guardian] → Modal → Save
  → [Alert Preferences] → Modal → Switches
  → [Long-press Guardian] → Remove
```

### 7. Discreet Mode Quick Exit
```
Any Screen → [Discreet Mode ON]
  → SOS Screen → [Quick Exit] → /calculator (innocent calc)
  → Calculator → [Long-press =] → Home
  → Or → /fake-call (simulated incoming call)
```

### 8. Offline SOS via BLE Mesh
```
/relay → [Enable Mesh Forwarding]
  → [Simulate Broadcast] → Log shows multi-hop
  → Real: Peer device relays encrypted packet to gateway → uploads to API
```

---

## File Structure Summary

```
artifacts/safarsaathi/
├── app/
│   ├── _layout.tsx           # Root stack + tabs + auth guard
│   ├── index.tsx             # Home dashboard
│   ├── map.tsx               # Safety map
│   ├── sos.tsx               # Active SOS
│   ├── watch.tsx             # Watch Me
│   ├── start-trip.tsx        # Trip planner
│   ├── ride.tsx              # Ride Check
│   ├── trip.tsx              # Live trip
│   ├── guardians.tsx         # Guardian circle
│   ├── calculator.tsx        # Discreet calculator
│   ├── fake-call.tsx         # Fake incoming call
│   ├── login.tsx             # Login
│   ├── signup.tsx            # Signup
│   ├── onboarding.tsx        # 3-step setup
│   ├── pin.tsx               # PIN entry
│   ├── privacy.tsx           # Privacy centre
│   ├── prompt.tsx            # Safety prompt
│   ├── relay.tsx             # BLE mesh relay
│   ├── settings.tsx          # Settings
│   └── ui-kit.tsx            # Component showcase
├── components/               # Reusable UI components
├── context/                  # React contexts
├── services/                 # Business logic services
├── constants/                # Colors, features
├── i18n/                     # Internationalization
└── utils/                    # Helper functions
```

---

## Notes for Demo/Review

1. **Demo Mode:** Most screens use `FEATURES.demo` flag for fallback data when APIs unavailable
2. **Mock Data:** Guardians, routes, deliveries use hardcoded demo values for prototype fidelity
3. **Discreet Mode:** Affects SOS screen title, adds Quick Exit, modifies notification behavior
4. **PIN Security:** Cancel vs Duress PINs visually identical (FR-07); duress silently escalates
5. **Offline-First:** BLE mesh relay, local PIN storage, cached trip data work without internet
6. **Internationalization:** English/Hindi via `useLanguage` hook and `t()` function

---

*Snapshot captured from source code on 2026-11-13. For live interactive preview, run `npx expo start` in `artifacts/safarsaathi/`.*