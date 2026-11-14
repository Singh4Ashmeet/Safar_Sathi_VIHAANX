# Security Analysis & Privacy

> **Title**: Security Analysis, Threat Model (T1–T21), Mandatory Hardening Checklist & Privacy  
> **Source Sections**: Section 13 (Security analysis, 13.1–13.4)  
> **Owner**: Dev A (Backend / Security Lead)  
> **Status**: Frozen  
> [← Back to Documentation Index](README.md)

---

## 13. Security analysis

The free stack adds four new threats (T18–T21) around third-party free services and the external ticker; all the earlier mitigations stand.

### 13.1 Assets and trust boundaries

| Asset | Why it matters | Where it lives |
| :--- | :--- | :--- |
| **Real-time and historical location** | Can enable stalking or harm if exposed | Device, API, Postgres |
| **Guardian phone numbers, emails, Telegram IDs** | Personal data of third parties | Postgres |
| **Private keys (box, sign)** | Forging SOS, reading relay payloads | Device secure store only |
| **PIN hashes, duress setting** | If leaked, duress is defeated | Device secure store |
| **Share-link tokens** | Grant live location to whoever holds them | Hashed in DB; in SMS in transit |
| **Server private key** | Decrypts relay packets | Server environment only |
| **Tick secret, Telegram secret, service keys (OpenRouteService, SMTP, gateway login)** | Abuse of free quotas, forged ticks, channel takeover | Server environment only |

**Trust boundaries:** (1) app and API over HTTPS; (2) phone and other phones over BLE (untrusted peers); (3) API and third-party free services (SMS gateway cloud, Expo, Telegram, OpenRouteService); (4) guardian's browser and the public page (anyone holding the link); (5) external tickers and the tick endpoint.

---

### 13.2 Threat model

| # | Threat and scenario | Mitigation | Residual risk |
| :--- | :--- | :--- | :--- |
| **T1** | **Abuser tracks a woman through the app.** A controlling partner adds her as a "guardian" or installs the app on her phone | Location is shared only by the person being tracked; a guardian can never pull someone's location; every share link is visible in the Privacy Center with one-tap revoke; the user is notified when a guardian is added; audit log | A coerced user can still share; mitigated by duress mode and education |
| **T2** | **Phone snatched or forced unlock.** Attacker grabs the phone, switches it off or kills the app | Server watchdog escalates on silence; duress PIN escalates silently; last-gasp location on low battery | Very short window before the first missed heartbeat |
| **T3** | **Fake SOS spam to guardians** (harassment by repeated alerts) | Auth required; per-user rate limits; guardian can mute or block; SOS idempotent | A determined abuser with a real account; handled by blocking |
| **T4** | **Phishing via fake alert SMS.** Attacker imitates our SMS with a malicious link | Links always use one fixed host and path (`/t/{token}`); tokens are long random strings; the page never asks for login or money; guardian education line in the consent message | Without an owned short domain the host name is long and less recognisable; buying a domain is on the roadmap. Social engineering is never fully removable |
| **T5** | **Tracking link leaks.** Guardian forwards the link | Tokens expire (trip end or hard limit), are revocable, per-guardian, hashed at rest, and reveal only that trip | Link holder can see location until expiry |
| **T6** | **Account takeover through password reuse or phishing** | Firebase Auth; email verification; re-authenticate to edit guardians or PINs; notify user on guardian changes | Passkeys are a roadmap item |
| **T7** | **IDOR / broken access control.** User A guesses a trip or SOS ID | All queries scoped by `user_id` from the verified token, never from the path; UUIDs; tests for cross-user access | Implementation bugs; covered by tests (IT-10) |
| **T8** | **Relay flooding with many fake packets** | Relay-side rate limits and bounded queue; gateway verifies signature and sender; gateway-side per-sender limits; TTL | Battery cost on nearby relays, bounded by caps |
| **T9** | **Replay of old SOS by re-broadcasting a captured packet** | Unique `eventId`, `createdAt` window, server dedupe | Replays inside the window are deduped |
| **T10** | **BLE eavesdropping and tracking.** Observer logs packets and correlates senders | Payload encrypted; duress and location only inside ciphertext; `senderTag` rotates daily (11.2) | Traffic analysis of timing remains |
| **T11** | **Server breach. DB leaked** | Minimal retention (trip points auto-deleted after 7 days on the free tier, configurable); secrets in environment; hashed tokens; least-privilege DB user; the database provider encrypts at rest | Server can read trip location by design; per-guardian E2EE is a roadmap item |
| **T12** | **Leaked keys in the repository.** 1.0 shipped a Google key in source | Delete the old Google key now (the project no longer uses Google Maps); remove it from git history; all other keys via environment variables and `.env.example`; never commit `.env` | Old key may already be copied; deleting it ends its use |
| **T13** | **GPS spoofing with a fake-location app** | Read the mocked flag on Android and flag the point; server flags impossible jumps; fall back to last plausible fix | Sophisticated spoofing on rooted devices |
| **T14** | **PIN brute force** | Salted hash in secure store; attempt throttling and lockout; wrong PIN looks normal | 4–6 digit PINs are weak if the secure store is extracted; limitation documented |
| **T15** | **SMS pumping / abuse.** Attacker adds many numbers to make us send SMS | Max 5 guardians, max invites per day, verified email required, per-IP and per-user limits; on the free stack the gateway phone's own send limits are a second cap | Bounded by limits |
| **T16** | **API denial of service** | Rate limits, body size cap (for example 64 KB), batch caps (50 points), timeouts | Platform-level DDoS needs a CDN or WAF later |
| **T17** | **Supply chain. Malicious dependency** | pnpm lockfile only (delete the stray `package-lock.json`), pinned versions, `pnpm audit`, few crypto dependencies | Residual npm risk |
| **T18** | **SMS gateway cloud exposure (new).** In cloud mode the gateway service relays message text and phone numbers | Enable the gateway's end-to-end encryption passphrase; put only the user's name and a tokenised link in the text, never coordinates; use local-server mode on a LAN for demos; log nothing about message bodies | The service still sees guardian numbers and metadata; a DLT gateway or self-hosted gateway server replaces it later |
| **T19** | **Free-quota exhaustion (new).** Abuser or traffic burns the routing quota or the gateway phone's SMS allowance | Quota guard (FR-16), route cache, per-user rate limits, SMS only for SOS and guardian events, push and Telegram first when the guardian has them | Legitimate emergencies must never wait behind routing traffic: routing is degradable, SOS delivery is not |
| **T20** | **Forged or abusive ticks (new).** Someone calls `/internal/tick` repeatedly | Secret header with constant-time compare; per-IP rate limit; tick is idempotent and cheap | Secret leak; rotate the secret and update both tickers |
| **T21** | **Channel takeover and spoofed consent (new).** Someone claims a guardian's Telegram or email | Telegram consent only through a one-time deep-link token; email consent through a one-time link; consent can be revoked from the Privacy Center | A guardian's own account compromise is out of our control |

---

### 13.3 Mandatory hardening checklist (P0, owner: Dev A unless noted)

- [ ] Firebase ID-token verification on every non-public route
- [ ] zod validation on every request body and query (generated `api-zod` schemas)
- [ ] Ownership check in every query (`WHERE user_id = req.user.id`)
- [ ] `helmet`, CORS locked to known origins (1.0 used open `cors()`), JSON body limit, `express-rate-limit`
- [ ] No coordinates or phone numbers in logs
- [ ] Share tokens hashed at rest; constant-time compare
- [ ] Idempotency on `/sos` and `/relay/packets`
- [ ] Secrets only via environment; `.env.example` committed, `.env` ignored
- [ ] Tick endpoint protected by secret header and rate limit (new)
- [ ] Gateway end-to-end passphrase enabled and gateway credentials in environment only (new)
- [ ] Firestore rules set to deny-all (the client no longer uses it)
- [ ] Old Google key deleted and removed from git history (Dev C and Dev A)
- [ ] App: keys and PIN hashes in `expo-secure-store`; no tokens in AsyncStorage
- [ ] Dev-only auth bypass is disabled when `NODE_ENV=production`

---

### 13.4 Privacy and legal

- **DPDP Act 2023 (consult counsel before launch):** clear notice and consent, purpose limitation, data minimisation, right to erasure (`DELETE /me`), breach readiness, and special care for children's data. Launch is 18+ only.
- **Guardian consent:** a guardian is a third party and must consent before receiving live location.
- **Third-party processors:** list the free services that touch personal data (database host, API host, SMS gateway cloud, Expo, Telegram, Firebase) in the privacy notice; free tiers do not remove that duty.
- **Retention defaults (free tier):** trip points 7 days, SOS records 12 months, audit logs 12 months, relay raw packets 7 days. All configurable.
- **Disclaimer:** the product complements, and never replaces, emergency services. Terms say so plainly.

