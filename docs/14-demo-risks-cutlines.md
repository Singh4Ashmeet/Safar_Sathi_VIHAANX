# Demo Script, Risks & Cut-Lines

> **Title**: Six-Minute Demo Script, Warm-up Routine, Risk Register & Cut-lines  
> **Source Sections**: Section 17 (Demo script, risks and cut-lines, 17.1–17.4)  
> **Owner**: All (Demo Director: Dev C)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 17. Demo script, risks and cut-lines

The six-minute demo is unchanged; a pre-demo warm-up routine and five new risks cover the free stack.

### 17.1 Six-minute demo script

1. **Problem (30 s):** the three assumptions that safety apps make, and how real incidents break them.
2. **Set-up (30 s):** Meena adds her husband, who has a basic phone. He gets an SMS consent link, sent through our spare-phone gateway; no app.
3. **Trip (60 s):** start a trip; lock the phone; the guardian page shows a live moving dot in a basic browser.
4. **Silent trouble (60 s):** force-stop the app. After the demo threshold, the server alerts the guardian anyway.
5. **Duress (45 s):** open the prompt, enter the duress PIN. The screen says "cancelled"; the guardian still gets the alert.
6. **Offline relay (90 s):** airplane mode, press SOS; the mesh visualiser shows the packet hopping; a gateway phone uploads it; the guardian is alerted. Label what is real and what is simulated.
7. **Close (45 s):** safety map, privacy centre, business model, the honest free-stack slide (what is free today and what we upgrade first), roadmap.

---

### Warm-up routine (new), 15 minutes before going on stage

Open `/api/readyz` and confirm a recent tick; send one test SOS to the demo guardian; check the gateway phone's charge, signal and SMS pack; check the OpenRouteService quota; cache the demo route; confirm the Supabase project is active.

---

### 17.2 Risk register

| Risk | Likelihood | Impact | Response |
| :--- | :--- | :--- | :--- |
| **BLE spike fails** | Medium | High | `SimTransport` plus visualiser, with honest labelling; keep a two-phone beacon proof if possible |
| **Local build fails on a laptop** | Medium | High | Dev C owns builds; one known-good machine and a prebuilt APK from W8; EAS free tier as a backup |
| **SMS gateway phone fails or is throttled** | High | Medium | Standby phone; push, Telegram and link as parallel channels; console provider for tests; verified numbers only |
| **Free host sleeps and the watchdog stops (new)** | Medium | High | Two tickers, boot-time catch-up sweep, warm-up routine, laptop host with a tunnel as demo primary |
| **Free database pauses or fills (new)** | Low | High | Ticks keep it active; short retention; size check each morning; backup export before the demo |
| **Free routing quota or tile service fails (new)** | Medium | Medium | Route cache, straight-line ETA, switchable tile URL; the demo route is pre-cached |
| **Free-tier terms differ from this document (new)** | Medium | Medium | Day-zero re-verification (15.3); everything behind an interface |
| **Merge conflicts at integration** | Medium | Medium | Ownership map, merge windows, small PRs |
| **Wi-Fi at the venue is poor** | Medium | Medium | Mobile hotspot; local demo server as fallback |
| **Sleep deficit causes bugs** | High | Medium | Mandatory 6-hour sleep block; feature freeze at W28 |

---

### 17.3 Cut-lines (decide in advance)

- **At W14, if behind:** drop ride verification, fake call, night theme.
- **At W20:** drop real BLE and ship the simulated mesh with a two-phone beacon proof.
- **At W28:** drop Hindi beyond the SOS and trip screens.
- **Never cut:** SOS delivery, server watchdog, guardian web page, duress PIN, security checklist 13.3.

---

### 17.4 Roadmap after the hackathon

The first upgrades are the ones that remove free-tier ceilings: a DLT-registered SMS gateway, an always-on host, an owned short domain, and self-hosted routing and tiles.

After that: per-guardian end-to-end encryption; GATT-based relay with a native module; iOS parity where possible; aggregator integration for ride verification; wearable and BLE panic-button triggers; evidence vault; BLE tracker detection; safe-word authentication; campus dashboard; 112 interoperability; passkeys; independent security review.

