# Appendices

> **Title**: Appendices (Pitch Outline, Definition of Done, Sources for Free-Tier Limits)  
> **Source Sections**: Appendices (Appendix A, Appendix B, Appendix C)  
> **Owner**: All  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## Appendix A. Pitch outline (for the submission deck)

1. **The problem and the three broken assumptions**
2. **Our insight:** protection that works when the phone, the network and the hands can't
3. **Product tour:** guardian with no app, watchdog, duress, offline relay
4. **Architecture in one picture and why it is resilient**
5. **Inclusivity:** Hindi, low-end phones, feature-phone guardians, every city tier
6. **Security and privacy:** consent, expiry, encryption, retention, honest limits
7. **Built at ₹0 (new):** what is free today, where the ceilings are, and what we upgrade first
8. **Business model and go-to-market:** campus, employers, mobility, government
9. **Traction plan and roadmap**

---

## Appendix B. Definition of Done (whole project)

- [ ] IT-1 to IT-12 pass on real phones against the deployed server
- [ ] Security checklist 13.3 fully ticked; leaked Google key deleted
- [ ] Release APK installs on all demo phones; backup video recorded
- [ ] README with setup, env variables, architecture picture and demo steps
- [ ] `docs/free-tier-limits.md` lists every free service, its limit and its fallback, dated
- [ ] Everything simulated is labelled as simulated in the app and the pitch
- [ ] Core SOS, watchdog, guardian page and duress PIN demonstrated live
- [ ] No paid service, card-gated account or paid licence anywhere in the stack

---

## Appendix C. Sources for free-tier limits (checked 12 Nov 2026)

These figures come from vendor and documentation pages returned by search on 12 Nov 2026; the pages were read as search excerpts, not audited in full. Limits change, so treat them as the starting point for the day-zero verification in section 15.3.

| Service | What was checked | Source |
| :--- | :--- | :--- |
| **Render free web service** | Spins down after 15 minutes without traffic, about a minute to wake, 750 free instance hours a month, free Postgres expires after 30 days | Render free-tier docs |
| **Supabase free plan** | 500 MB database, 50,000 monthly active users, 2 active projects, pause after 1 week of inactivity | Supabase pricing |
| **Expo EAS Build free plan** | Low-priority queue and a small monthly build quota (sources differ on the exact number); local builds are the unlimited alternative | Expo plans, EAS Build guide |
| **SMS Gateway for Android** | Open source under Apache-2.0; local and cloud server modes; no registration; needs the SEND_SMS permission | GitHub repository, Documentation |
| **OpenFreeMap** | Free public vector tiles, no key, no request limits, no search or routing, donation-funded, commercial use allowed | OpenFreeMap |
| **OpenRouteService** | Standard free plan: 2,000 directions a day and 40 a minute, 1,000 geocoding a day; commercial use is not allowed on the collaborative plan | OpenRouteService plans |

### Not verified for this document (marked * in the changes table)

- Firebase Spark plan terms
- Expo Push and FCM setup
- cron-job.org
- UptimeRobot
- Cloudflare quick tunnels
- GitHub Actions free minutes
- The MapLibre React Native config plugin with Expo SDK 54
- Nominatim policy
- Brevo and Gmail SMTP limits
- OpenStreetMap tile-usage terms

*Verify each on day zero.*

