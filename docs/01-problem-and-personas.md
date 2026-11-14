# Problem Statement, Design Principles & Personas

> **Title**: Problem Statement, Design Principles & Personas  
> **Source Sections**: Section 3 (Problem statement and design principles), Section 4 (Personas)  
> **Owner**: All (Lead: Dev B)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 3. Problem statement and design principles

Current safety tools fail exactly when a woman most needs them, and our principles are built around those failures.

### 3.1 Why current approaches fall short

- **Phone-dependent.** If the phone is snatched, switched off, or out of battery, protection ends.
- **Network-dependent.** No signal means no alert, exactly where help is hardest to find.
- **Needs the victim's hands.** Unlocking, opening an app and tapping SOS is unrealistic during an assault.
- **Guardian friction.** Requiring guardians to install an app excludes the people most likely to be a woman's only contact: parents and spouses with basic phones.
- **Alert fatigue.** Noisy or false alerts teach users and guardians to ignore the app.
- **Privacy risk.** Continuous location data is itself dangerous if leaked or misused by a controlling partner.

*To do before the pitch: add 2–3 verified statistics (for example from NCRB or NFHS reports) with sources. We deliberately hard-code no unverified numbers here.*

### 3.2 Design principles

1. **Assume the phone is hostile territory.** Anything critical must also run server-side.
2. **Assume the network will fail.** Queue, retry, and relay.
3. **Assume someone may be watching.** Neutral notifications, duress PIN, no content in lock-screen text.
4. **Fewest taps, lowest friction.** SOS in one gesture; guardians need nothing installed.
5. **Privacy by default.** Location is shared only during a trip or SOS, links expire, and relays see only ciphertext.
6. **Core safety is always free to the user.** SOS and guardian alerts are never paywalled.
7. **Fail loud, not silent.** If an alert cannot be delivered, the user is told.
8. **Free by construction (new).** No component may need a credit card, a paid tier or a paid licence. Every free-tier limit is written down, monitored, and has a fallback.

---

## 4. Personas

Five personas drive the design, from a Tier-1 night-shift analyst to a guardian with a basic phone.

| Persona | Context | Needs | Design implication |
| :--- | :--- | :--- | :--- |
| **Priya, 26, Tier-1 night-shift analyst** | Books cabs after 10pm, mid-range phone | Verify cab, share ride, auto-escalation if the ride deviates | Ride verification, deviation alerts, watchdog |
| **Ananya, 19, Tier-2 college student** | Hostel curfew, shared autos, 2 GB RAM phone, limited data | Cheap, low-battery, discreet, campus-friendly | Lean app, Hindi UI, silent SOS, campus mode (B2B) |
| **Meena, 34, Tier-3 clinic worker** | Travels between villages, patchy network, husband has a feature phone | Works offline, guardian on SMS only | SMS-link guardians, BLE relay, last-gasp alert |
| **Guardian: mother, husband or friend** | May have only a basic phone | Know immediately, see where, tell "I'm on it" | SMS with web link, one-tap acknowledge on the page |
| **Institution admin: college warden, HR** | Needs aggregate insight without surveilling individuals | Anonymised zone view | Anonymised zone dashboard (stretch) |

