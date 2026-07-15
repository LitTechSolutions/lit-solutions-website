# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

**Start here if resuming cold:** `DEV_STATE.json` → `releaseRecommendation`, then `OWNER_DECISIONS.md` (items #1–#4 all resolved — Postgres on Neon, payment timing, plan limits, and invite-only registration; 6 items still open), then `sessions/SESSION_18_COMMERCIAL_ENDPOINTS.md` for the latest work.

## Documents

| Doc | Covers |
|---|---|
| [00_DEV_CONTROL.md](00_DEV_CONTROL.md) | Process, ground rules, how to resume cold |
| [DEV_STATE.json](DEV_STATE.json) | Machine-readable session/wave/blocker state + release recommendation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current-state architecture, module reuse classification, target architecture — data-store section reflects the decided Postgres/Neon design |
| [REQUIREMENTS_CATALOG.json](REQUIREMENTS_CATALOG.json) | F001–F060 lightweight catalog + recommended build sequence |
| [DATA_MODEL.md](DATA_MODEL.md) | Current Blobs schema + decided Postgres schema, privacy data categories |
| [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md) | Current 2-tier/no-tenant auth vs. target 6-role org-scoped model |
| [API_CATALOG.md](API_CATALOG.md) | Current 12 functions + 9 spec-only functions vs. target API standards |
| [DECISION_LOG.md](DECISION_LOG.md) | Engineering decisions + the post-Session-9 owner decision record |
| [OWNER_DECISIONS.md](OWNER_DECISIONS.md) | 10 decisions only Dylan can make — **#1–#4 resolved, 6 still open** |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Migration protocol; next infrastructure step is provisioning Neon and running `migrations/001_initial_schema.sql` (~31 tables) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Target test coverage by layer, tooling recommendation, release gates |
| [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) | Standing local-only instruction; `DATABASE_URL` environment variable requirement |
| [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) | Rollback mechanics, current and required |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Session 9: what was and wasn't reviewable given no live deployment; one open finding (CSV formula-injection guard) |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping — 42 functions with logic, 30 with persistence, 9 with an HTTP endpoint |
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Discovery: real repo location, static-site architecture, audit findings |
| [sessions/SESSION_01_FOUNDATION.md](sessions/SESSION_01_FOUNDATION.md) | F005 RBAC, F008 audit trail, F056 settings |
| [sessions/SESSION_02_CUSTOMER_WORKSPACE.md](sessions/SESSION_02_CUSTOMER_WORKSPACE.md) | F009, F012, F015, F016, F017 |
| [sessions/SESSION_03_TICKETING.md](sessions/SESSION_03_TICKETING.md) | F019–F023/F029, F025 |
| [sessions/SESSION_04_COMMERCIAL.md](sessions/SESSION_04_COMMERCIAL.md) | F026, F028, F049, F050, F052 |
| [sessions/SESSION_05_IT_SERVICES.md](sessions/SESSION_05_IT_SERVICES.md) | F044, F046/F047, F048 |
| [sessions/SESSION_06_WEBSITE_CARE.md](sessions/SESSION_06_WEBSITE_CARE.md) | F036, F037 (reuse), F040/F042 evidence categorization |
| [sessions/SESSION_07_REPORTING_OPERATIONS.md](sessions/SESSION_07_REPORTING_OPERATIONS.md) | F051, F053, F054, F055, F057 (engines) |
| [sessions/SESSION_08_AI_ASSISTANCE.md](sessions/SESSION_08_AI_ASSISTANCE.md) | Gate-status record — F060 not started, 7-gate table |
| [sessions/SESSION_09_RELEASE_REVIEW.md](sessions/SESSION_09_RELEASE_REVIEW.md) | Final review of the original 9-session sequence: not ready, here's exactly why |
| [sessions/SESSION_10_DATA_STORE_DECIDED.md](sessions/SESSION_10_DATA_STORE_DECIDED.md) | Data store decided (Postgres/Neon); F001/F005/F008 persistence built |
| [sessions/SESSION_11_PERSISTENCE_EXPANSION.md](sessions/SESSION_11_PERSISTENCE_EXPANSION.md) | 12 more functions' persistence built, wired to existing pure engines |
| [sessions/SESSION_12_PERSISTENCE_FINAL_BATCH.md](sessions/SESSION_12_PERSISTENCE_FINAL_BATCH.md) | Final 6 functions' persistence; persistence layer now essentially complete |
| [sessions/SESSION_13_LIVE_DATABASE_VERIFIED.md](sessions/SESSION_13_LIVE_DATABASE_VERIFIED.md) | Migration run live, 4-function smoke test passed, a rejected prompt-injection attempt |
| [sessions/SESSION_14_PRICING_DECISION_AND_PERSISTENCE.md](sessions/SESSION_14_PRICING_DECISION_AND_PERSISTENCE.md) | Pricing/plan-limit owner decision resolved; F026/F027/F028/F049/F052 engines + persistence completed; real plan limits seeded live |
| [sessions/SESSION_15_FIRST_HTTP_ENDPOINT.md](sessions/SESSION_15_FIRST_HTTP_ENDPOINT.md) | First Netlify Function endpoint (tickets.js, F019/F023); session→RBAC auth bridge; deps-injection seam makes the endpoint layer unit-testable for the first time; live smoke test |
| [sessions/SESSION_16_THREE_MORE_ENDPOINTS.md](sessions/SESSION_16_THREE_MORE_ENDPOINTS.md) | organizations.js, work-queue.js, approvals.js; platform_admin/technician legacy-role bridges; two new honest rbac.js capabilities (workqueue.view, approval.view); live smoke test |
| [sessions/SESSION_17_INVITE_ONLY_REGISTRATION.md](sessions/SESSION_17_INVITE_ONLY_REGISTRATION.md) | F002 built completely: invite-only registration, invitations.js + invitation-accept.js, consent capture (first F007 piece), auth-register.js gated behind a disabled flag; live smoke test; explicit scope decision on a much larger autonomous-continuation directive |
| [sessions/SESSION_18_COMMERCIAL_ENDPOINTS.md](sessions/SESSION_18_COMMERCIAL_ENDPOINTS.md) | scope-of-work.js, change-orders.js, payment-requests.js -- the full ticket-to-paid commercial flow now live over HTTP; 3 new honest rbac.js capabilities; live smoke test |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first real release).

## Source code

`src/domain/`, `src/policy/`, `src/audit/` (Blobs-backed F008 shaping), `src/settings/`, `src/notifications/`, `src/timeline/`, `src/dashboard/`, `src/tracking/`, `src/reminders/`, `src/reporting/`, `src/admin/`, `src/templates/`, `src/webhooks/`, `src/export/`, `src/analytics/` — the pure domain/policy layer, plus `invitationLifecycle.js` (Session 17). `src/db/` — **25 files**, real Postgres persistence for every engine-complete function: `pgClient.js`, `organizationStore.js`, `membershipStore.js`, `pgAuditSink.js`, `serviceRecordStore.js`, `approvalStore.js`, `activityEventStore.js`, `ticketStore.js`, `ticketWorkflowStore.js`, `workLogStore.js`, `websiteProfileStore.js`, `assetStore.js`, `reminderStore.js`, `itSupportStore.js`, `checklistStore.js`, `workQueueQuery.js`, `metricsStore.js`, `templateStore.js`, `webhookEventStore.js`, `scopeOfWorkStore.js`, `changeOrderStore.js`, `paymentRequestStore.js`, `entitlementStore.js`, `subscriptionStore.js`, `invitationStore.js`, `consentStore.js`. `migrations/001_initial_schema.sql` (37 tables) + `002_invitations_and_consent.sql` (invitation tokens + consent_records), both executed live against Neon. `netlify/functions/` — **9 Care Hub HTTP endpoints** (`tickets.js`, `organizations.js`, `work-queue.js`, `approvals.js`, `invitations.js`, `invitation-accept.js`, `scope-of-work.js`, `change-orders.js`, `payment-requests.js`, all on the `_lib/care_hub_auth.js` bridge), 13 more planned. `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step. `npm test` runs everything (`node --test`). Dependencies: `@netlify/blobs`, `@neondatabase/serverless`; `netlify-cli` (devDependency, local testing only). **541 tests, all passing.**

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; every test run is under `evidence/tests/`; live smoke tests (Session 13's 4-function test, Session 15's tickets.js test, Session 16's 3-endpoint test, Session 17's full invitation-lifecycle test, Session 18's full commercial-flow test) are under `evidence/migrations/`.

## Current state at a glance

- **Sessions 0–9 complete** (the master instruction's full defined sequence), **plus nine post-Session-9 continuation sessions (10–18)**. Nothing published or pushed at any point.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched throughout. Everything stays local for the entire build.
- **Built:** 42 functions with tested domain/policy logic, 30 with real Postgres persistence, **9 with a live HTTP endpoint**. 541 passing unit tests. **The database is live** — 38 tables across two migrations, live-verified end to end multiple times, including a full ticket-to-paid commercial flow (Session 18). No UI yet.
- **Release status:** **not ready** — see `DEV_STATE.json` → `releaseRecommendation`.
- **Next milestone:** 13 more endpoints (activity events, entitlements, subscriptions, technology assets, backups, reminders, IT support classification, checklists, metrics, templates, webhook events), following the established pattern. Session 17's large originating directive still has substantial unstarted work beyond endpoints — data retention/deletion, Privacy Policy content, remote-support/automation boundaries, F060 AI, MFA for admin, and F001–F060 workbook regeneration — all itemized with approved defaults preserved in `DEV_STATE.json`'s `ownerDecisionsRequired`.
