# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

**Start here if resuming cold:** `DEV_STATE.json` → `releaseRecommendation`, then `OWNER_DECISIONS.md` (all 7 items from Session 19's consolidated decision list were resolved by Dylan's Session 20 directive), then `sessions/SESSION_20_RBAC_AND_AUDIT_ENDPOINT.md` for the latest work. **24 endpoints exist** (Session 19's 23 plus `audit-log.js`); Session 20 also added TOTP MFA for platform_admin (`mfa-enroll.js`/`mfa-verify.js`/`mfa-manage.js`) as its own auth mechanism, not counted in the 24 since it's a login-flow addition rather than a Care Hub resource endpoint. Session 20 completed steps 1–5 of Dylan's 10-step implementation order (platform_admin ticket RBAC + audit logging, the audit-log endpoint, TOTP MFA, a React/Vite/TypeScript Care Hub scaffold, and real authentication/MFA UI + account shell on top of it at `care-hub-app/`); steps 6–10 (real ticket/checklist screens, Square/email integration, legal drafts, full a11y/security/e2e testing) are not started — each needs its own dedicated session(s). What exists in `care-hub-app/`: shared design tokens, a typed client for all 24 endpoints, accessible loading/empty/error/unauthorized/session-expired states, an app shell, and now a real login form + MFA enrollment/challenge screens + session-state gating (`AuthContext`/`RequireAuth`) — but no ticket/checklist screens yet, no QR-code rendering for MFA enrollment (manual-entry key only), and the full sign-in path hasn't been live-smoke-tested against a real backend (`netlify dev`) yet. **`MFA_ENCRYPTION_KEY` must be set in Netlify before any platform_admin can sign in** once this deploys — see `DEPLOYMENT_PLAN.md`.

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
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping — 42 functions with logic, 30 with persistence, 23 with an HTTP endpoint |
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
| [sessions/SESSION_19_REMAINING_ENDPOINTS.md](sessions/SESSION_19_REMAINING_ENDPOINTS.md) | Final 12 endpoints -- the HTTP layer is now complete (23 endpoints); 8 new rbac.js capabilities; a real production bug found and fixed (migration 003); 20-check live smoke test; consolidated decision list delivered |
| [sessions/SESSION_20_RBAC_AND_AUDIT_ENDPOINT.md](sessions/SESSION_20_RBAC_AND_AUDIT_ENDPOINT.md) | platform_admin ticket RBAC fix + a real ticket audit-logging gap closed; new audit-log.js endpoint (24th endpoint); a real audit-metadata-shape bug found and fixed; TOTP MFA for platform_admin (mfa-enroll.js/mfa-verify.js/mfa-manage.js, otpauth + AES-256-GCM secret encryption + hashed recovery codes); 26-check combined live smoke test; steps 1-3 of Dylan's 10-step Session 20 directive done, steps 4-10 explicitly not started |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first real release).

## Source code

`src/domain/`, `src/policy/`, `src/audit/` (Blobs-backed F008 shaping), `src/settings/`, `src/notifications/`, `src/timeline/`, `src/dashboard/`, `src/tracking/`, `src/reminders/`, `src/reporting/`, `src/admin/`, `src/templates/`, `src/webhooks/`, `src/export/`, `src/analytics/` — the pure domain/policy layer, plus `invitationLifecycle.js` (Session 17). `src/security/` (new, Session 20) — `totp.js` (RFC 6238 via `otpauth`), `mfaCrypto.js` (AES-256-GCM secret encryption + recovery-code hashing), both pure/testable, no `process.env` reads. `src/db/` — **25 files**, real Postgres persistence for every engine-complete function (unchanged file list from Session 18; Session 19 added a function to `reminderStore.js`, not a new file). `migrations/001_initial_schema.sql` (37 tables) + `002_invitations_and_consent.sql` (invitation tokens + consent_records) + `003_fix_triage_rule_id_type.sql` (real bug fix), all executed live against Neon. `netlify/functions/` — **24 Care Hub HTTP endpoints**, covering every persisted function plus the audit-log viewer: `tickets.js`, `organizations.js`, `work-queue.js`, `approvals.js`, `invitations.js`, `invitation-accept.js`, `scope-of-work.js`, `change-orders.js`, `payment-requests.js`, `service-records.js`, `website-profiles.js`, `entitlements.js`, `subscriptions.js`, `technology-assets.js`, `reminders.js`, `it-support.js`, `checklists.js`, `work-log.js`, `ticket-workflow.js`, `activity-timeline.js`, `metrics.js`, `templates.js`, `webhook-events.js`, `audit-log.js` (Session 20) -- all on the `_lib/care_hub_auth.js` bridge. Plus three new Session 20 auth-flow endpoints not counted in the 24 (`mfa-enroll.js`, `mfa-verify.js`, `mfa-manage.js` — login-flow additions, not Care Hub resource endpoints), and `auth-login.js` modified to branch platform_admin sign-in through them. `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step. `npm test` runs everything (`node --test`). Dependencies: `@netlify/blobs`, `@neondatabase/serverless`, `otpauth` (Session 20, pulls in `@noble/hashes`); `netlify-cli` (devDependency, local testing only). **702 tests, all passing.**

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; every test run is under `evidence/tests/`; live smoke tests (Session 13's 4-function test, Session 15's tickets.js test, Session 16's 3-endpoint test, Session 17's invitation-lifecycle test, Session 18's commercial-flow test, Session 19's 12-endpoint test, Session 20's RBAC/audit-log test and MFA test) are under `evidence/migrations/`.

## Current state at a glance

- **Sessions 0–9 complete** (the master instruction's full defined sequence), **plus eleven post-Session-9 continuation sessions (10–20)**. Nothing published or pushed at any point.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched throughout. Everything stays local for the entire build.
- **Built:** 42 functions with tested domain/policy logic, 30 with real Postgres persistence, **24 with a live HTTP endpoint** (23 persisted functions plus the new audit-log viewer), **plus TOTP MFA now protecting platform_admin sign-in** (`mfa-enroll.js`/`mfa-verify.js`/`mfa-manage.js`). 702 passing unit tests. **The database is live** — 38 tables across three migrations, live-verified end to end multiple times, including two real production bugs found and fixed by live testing (Session 19's triage-rule FK bug, Session 20's audit-metadata-shape bug). **A Care Hub UI scaffold exists** (`care-hub-app/`, React+Vite+TypeScript, builds to `/care-hub/`, verified in a real browser) — but it's a scaffold, not real screens: no login form, no MFA enrollment/challenge UI, no ticket/checklist screens, so platform_admin sign-in still has to be exercised via direct API calls until steps 5–6 build the real auth and resource screens on top of this foundation.
- **Release status:** **not ready** — see `DEV_STATE.json` → `releaseRecommendation`.
- **Next milestone:** all 7 of Dylan's Session 19 decision-list items were resolved by his Session 20 directive; steps 1-2 of its 10-step order (platform_admin ticket RBAC, audit-log endpoint) are done, steps 3-10 (TOTP MFA, the React/Vite Care Hub UI, tickets/checklists UI, Square/email integration, legal drafts, full a11y/security/e2e testing) are not started — each needs its own dedicated session(s).
