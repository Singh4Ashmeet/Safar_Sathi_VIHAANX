# SafarSaathi 2.0 — Documentation Index

> **Source**: SafarSaathi 2.0 — Product, Technical & Execution Document (Free-Stack Edition) (12 Nov 2026)  
> **Owner**: Dev C (docs/**), Dev A (docs/backend/**)  
> **Status**: Frozen (v2.0 Free-Stack Edition)

---

## Single Source of Truth Notice

> [!IMPORTANT]
> **Contract Rule**: The OpenAPI specification (`lib/api-spec/openapi.yaml`) wins over documentation on any API endpoint, parameter, or payload shape details. Open API contract changes must follow the process outlined in [13-integration-protocol.md](13-integration-protocol.md).

The original reference PDF document is retained unchanged at [source/SafarSaathi-2.0-Free-Stack.pdf](source/SafarSaathi-2.0-Free-Stack.pdf).

---

## Reading Order

For engineers, contributors, and evaluators onboarding to SafarSaathi 2.0, follow this suggested reading sequence:

1. [00-overview.md](00-overview.md) — Free-stack changes table, executive summary (Sec 1), and 5W1H (Sec 2)
2. [01-problem-and-personas.md](01-problem-and-personas.md) — Problem statement, failure modes of existing tools, design principles (Sec 3), and personas (Sec 4)
3. [02-scope-and-priorities.md](02-scope-and-priorities.md) — P0 / P1 / P2 feature matrix (F1–F19) and component ownership (Sec 5)
4. [03-PRD.md](03-PRD.md) — Product requirements, functional requirements FR-01–FR-16, NFRs, user flow, success metrics (Sec 6)
5. [04-business-model.md](04-business-model.md) — Value proposition, revenue streams, go-to-market, cost structure & free-tier ceilings (Sec 7)
6. [05-TRD.md](05-TRD.md) — Technical architecture diagram, free-stack tech decisions, backend modules, watchdog design, background tracking, observability (Sec 8)
7. [06-api-contract.md](06-api-contract.md) — API conventions, frozen endpoints, key payload shapes, frozen notification copy (Sec 9)
8. [07-data-model.md](07-data-model.md) — PostgreSQL Drizzle schema, table definitions, 500 MB storage budget & retention policies (Sec 10)
9. [08-ble-relay-protocol.md](08-ble-relay-protocol.md) — Offline store-and-forward BLE SOS relay, 192-byte packet layout, cryptography, relay engine rules (Sec 11)
10. [09-frontend-spec.md](09-frontend-spec.md) — Screen inventory, navigation routes, touch targets, offline & server-waking banners, i18n (Sec 12)
11. [10-security-and-privacy.md](10-security-and-privacy.md) — Assets, threats T1–T21, mandatory P0 hardening checklist, DPDP Act 2023 compliance (Sec 13)
12. [11-loopholes.md](11-loopholes.md) — Sixteen physical/digital loopholes L1–L21, amendment A1, carry-over fixes from 1.0 (Sec 14)
13. [12-execution-plan.md](12-execution-plan.md) — Roles (Dev A, B, C), ownership map, day-zero checklist, B ↔ C frozen interface, timeline (Sec 15)
14. [13-integration-protocol.md](13-integration-protocol.md) — Nine integration rules, contract change PR process, environment variables, integration tests IT-1–IT-12 (Sec 16)
15. [14-demo-risks-cutlines.md](14-demo-risks-cutlines.md) — Six-minute demo script, warm-up routine, risk register, cut-lines, post-hackathon roadmap (Sec 17)
16. [appendices.md](appendices.md) — Appendix A (Pitch outline), Appendix B (Definition of Done), Appendix C (Sources for free-tier limits checked 12 Nov 2026)
17. [free-tier-limits.md](free-tier-limits.md) — Day-zero verification tracker for all 0-cost services, limits, sources, and fallbacks
18. [runbook.md](runbook.md) — Operations runbook (deploy, tickers, TICK_SECRET rotation, SMS gateway phone, backup restore, demo warm-up)
19. [backend/dev-a-tasks.md](backend/dev-a-tasks.md) — Dedicated backend execution guide for Dev A across Phases 0 to 6 with deliverables
20. [backend/env-variables.md](backend/env-variables.md) — Complete environment variable specification and reference for the backend

