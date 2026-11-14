# Business Model & Cost Structure

> **Title**: Business Model, Value Proposition & Free-Tier Ceilings  
> **Source Sections**: Section 7 (Business model, 7.1–7.6)  
> **Owner**: All (Lead: Dev A)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 7. Business model

Core safety stays free for users, revenue comes from institutions, and the hackathon build costs nothing to run.

### 7.1 Value proposition

- **Users:** a safety net that works even when they cannot act, free at the core.
- **Guardians:** peace of mind with zero setup.
- **Institutions:** a duty-of-care tool that does not turn into employee surveillance.

### 7.2 Segments and revenue streams

Prices are illustrative and must be validated.

| Stream | Customer | Offer | Pricing |
| :--- | :--- | :--- | :--- |
| **B2C freemium** | Individual women | Free: SOS, 3 guardians, trips, map. Premium: more guardians, evidence vault, ride verification extras, family dashboard | ₹49–99 / month |
| **B2B2C campuses** | Colleges, hostels | Campus mode: curfew trips, warden escalation, anonymised hotspots | Per-student per-year licence |
| **B2B2C employers** | Companies with night shifts | Duty-of-care, POSH support, cab integration | Per-seat per-month |
| **B2B mobility** | Cab aggregators, fleets | Ride-verification API and deviation alerts | API / per-ride fee |
| **B2G / CSR** | State programmes, smart-city, NGOs | Co-branded deployment, hotspot analytics, helpline interop | Grants / contracts |
| **Insurance partnerships** | Insurers | Safety-score-linked benefits (opt-in only) | Referral / revenue share |

### 7.3 Go-to-market

1. Campus pilots (high density, shared trust, easy onboarding) to prove usage data.
2. Employer night-shift programmes for recurring revenue.
3. State and city partnerships for Tier-2/3 reach and 112 interoperability.
4. Community and NGO channel for rural and small-town adoption, with Hindi-first onboarding.

---

### 7.4 Cost structure and the free-tier ceiling

The hackathon and pilot run at ₹0 because each layer uses a free tier or open-source software. The honest view is that free tiers have ceilings, and each ceiling has a named upgrade that revenue or grants should fund.

| Layer | Free choice today | Ceiling | What replaces it when we outgrow it |
| :--- | :--- | :--- | :--- |
| **API host** | Render free web service | 750 free hours a month, spins down when idle | Paid always-on instance |
| **Database** | Supabase free Postgres | 500 MB, pauses after 1 week idle | Supabase Pro or a managed Postgres |
| **SMS** | Android SMS gateway on a spare phone | One SIM's sending limits and plan; no sender ID | DLT-registered Indian SMS gateway (registration takes days to weeks, so start it right after the hackathon) |
| **Routing** | OpenRouteService free key | 2,000 directions a day | Self-hosted OpenRouteService or a paid routing API |
| **Map tiles** | OpenFreeMap | Donation-funded public service, no SLA | Self-hosted tiles or a paid tile provider |
| **Builds** | Local Gradle builds | None | None needed |

**Key principle:** SMS is the one cost that scales with emergencies rather than with users, so it stays small relative to revenue once we move off the gateway phone.

---

### 7.5 Competitive landscape

These are positioning hypotheses; review each product's current feature set before pitching.

| Alternative | Strength | Gap SafarSaathi addresses |
| :--- | :--- | :--- |
| **OS-level emergency SOS (Apple, Google)** | Built in, trusted | No trip watchdog, no guardian web link, no offline relay to a guardian |
| **Existing safety apps and police apps** | Some official integration | Mostly phone-dependent; guardians often need the app; limited offline behaviour |
| **Ride-hailing in-app safety** | Contextual to rides | Only covers that platform's rides |
| **Location-sharing apps** | Familiar | Not designed for escalation or duress |

---

### 7.6 Moat and ethics

- **Moat:** the combination of server-side watchdog, offline relay network, discreet UX and no-app guardians, plus the network effect of relay-capable phones in a locality.
- **Ethical commitments:** core SOS is never paywalled; no selling of location data; contact consent for every guardian; anti-stalking safeguards (section 14).

