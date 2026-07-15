# Owner Decisions Required

Consolidated from `v23/docs/audit/AUDIT_STATE.json` (11 owner-decision findings), the Master Function Index's 8-item "Stop-and-Approve Owner Decisions" list, and engineering findings surfaced across Sessions 0–9. Status as of 2026-07-15: **items #1, #2, #3, and #4 are RESOLVED**; 6 remain open. Item #1's resolution unblocked F001/F005 persistence and, by extension, real endpoints for most previously-built work; items #2/#3's resolution unblocks the last five engine-complete functions (F026/F027/F028/F049/F050/F052) with real business values, not just engines; item #4's resolution (invite-only) unblocked F002 end to end.

**Session 20 update:** Dylan's Session 20 directive resolved all 7 items from Session 19's consolidated decision list (Care Hub UI architecture, admin MFA specifics, readiness-checklist customer/staff data split, platform_admin ticket access, legal/privacy content approach, Square/credential handling, and the audit-log endpoint) — see `sessions/SESSION_20_RBAC_AND_AUDIT_ENDPOINT.md` for the full text and implementation status. Of those 7: **platform_admin ticket access and the audit-log endpoint are BUILT and live-verified**; the other 5 (React/Vite UI, TOTP MFA, checklist data split, Square Sandbox integration, legal drafts) are **approved but not yet implemented** — each needs its own dedicated session(s), per the explicit 10-step order in Dylan's directive. Items #5–#10 below remain accurately described as still-open engineering/business decisions where noted, except where superseded by the Session 20 directive's more specific answers (data retention/legal-hold defaults and remote-support/AI boundaries were already resolved in Session 17, as recorded below).

## 1. Primary data store — ✅ RESOLVED (Dylan, 2026-07-14)

- **Decision:** Managed PostgreSQL, hosted on **Neon** (serverless-native, HTTP driver suited to Netlify Functions' invocation model — no persistent connection pool to exhaust). Netlify Blobs remains in place for what it already does well: CMS content, session tokens, and file blobs. See `DECISION_LOG.md` for the full record and `ARCHITECTURE.md`/`DATA_MODEL.md` for the resulting schema.
- **Unblocks:** F001 (Organization Provisioning) and F005 (RBAC) persistence, and by extension real endpoints for every function whose logic was already built and tested against this decision (F008, F009, F010, F012–F017, F019–F029, F031, F036, F041–F045, F048, F049–F052).
- **Still open as a follow-on:** provisioning the actual Neon project/database and setting `DATABASE_URL` (or equivalent) as a Netlify environment variable — an infrastructure step, not a decision, tracked in `DEPLOYMENT_PLAN.md`.

## 2. Pricing, discounts, deposits, payment timing — ✅ RESOLVED (Dylan, 2026-07-14)

- **Heroes Discount rate & verification:** already live and approved — 15% (`netlify/functions/website-designer.js`), per-category document verification already published on `heroes-pricing.html` (military ID/CAC, DD-214, employment letters, etc.). No new decision needed; confirmed as already-recorded per the requirements precedence order.
- **Payment timing for Care Hub custom work / change orders (Dylan, verbatim):**
  - Work priced **below $500**: full payment due upfront after the customer approves the quote.
  - Work priced **at $500 or more**: 50% deposit before work begins, remaining 50% due upon completion and before publication/deployment/final handoff.
  - Hardware, software licenses, paid integrations, subscriptions, and other third-party expenses: **always paid upfront**, regardless of total.
  - No out-of-scope work begins without written customer approval (already structurally enforced by F016/F027's approval workflow).
  - **Implemented:** `src/policy/paymentSchedule.js`.
- **Blocks (now unblocked):** F026 (Scope/Estimate Generation), F027 (Change Order Approval), F028 (Payment Request/Reconciliation), F050 (Pricing/Discount Engine) — all now buildable/persistable with real values.

## 3. Plan limits and included work — ✅ RESOLVED (Dylan, 2026-07-14)

**Website Care Plan — $39/month:**
- Coverage for one website. Routine hosting/domain/SSL/availability/form/platform checks. Hosting-provider coordination when needed (hosting/domain charges themselves not included).
- Up to 30 minutes of small content edits per billing month, across no more than 2 submitted requests. "Small edits" = replacing existing text/images, updating hours/contact info, correcting links, similarly minor changes.
- Allowance resets monthly, **does not carry over**.
- Overage: $85/hour, billed in 15-minute increments, customer approval required before charges incurred.
- Out of plan scope entirely (needs a separate quote): new pages, redesigns, new functionality, custom coding, copywriting, SEO campaigns, malware recovery, substantial layout changes.

**Small Business IT Support Plan — $79/month:**
- Coverage for one business location, up to 5 named computers/devices.
- Up to 60 minutes of remote IT support per billing month, across no more than 2 support sessions/tickets. Covers routine email/printer/software/account-access/peripheral/device-configuration/general troubleshooting.
- Allowance resets monthly, **does not carry over**.
- Overage: $95/hour remote (15-minute increments); on-site $125/hour with a 1-hour minimum, travel charges possible outside the normal service area.
- Anything expected to exceed 2 hours, or involving network installation, server work, cybersecurity remediation, data recovery, business-wide migration, or hardware installation: **must** become a separately approved fixed-price quote, not plan-covered work.
- Hardware, software, licenses, subscriptions, third-party services: not included, ever.

- **Implemented:** `src/policy/overageBilling.js` (rate calculation), real rows seeded into the live `entitlement_limits` table (`src/db/entitlementStore.js`), wired to the existing `entitlementCheck.js` engine (Session 4).
- **Blocks (now unblocked):** F049 (Plan Entitlement/Usage Tracking), F021's fifth scoring factor (entitlement-aware priority), F052 (Subscription/Billing Plan Management).

## 4. Customer account registration model — ✅ RESOLVED (approved directive, 2026-07-15)

- **Decision:** Invite-only at launch. Public users may submit contact forms, quotes, and intake forms, but may not create a Care Hub account directly. Only a `platform_admin` (legacy "admin" session role) may invite a customer, typically after a purchase, signed agreement, or approved project.
- **Invitation mechanics:** single-use, 7-day expiry (`src/policy/invitationLifecycle.js`'s `TOKEN_TTL_DAYS`); only a SHA-256 hash of the token is ever persisted; the invitation link itself (delivered to the invitee's email) is treated as email-ownership proof, so no separate post-acceptance verification email is sent. Resend issues a fresh token/window and immediately invalidates the old one (overwrite, not append). Full lifecycle — create, resend, revoke, accept, and failed-accept attempts — is audited (F008).
- **Open self-registration** (`auth-register.js`) is NOT removed — it stays behind a new `open_registration` feature flag (F056 settings document), which defaults OFF/fail-closed like every other flag in this codebase, so it can be enabled later via settings without a code deploy, and is never live by accident.
- **Consent capture** happens at invitation acceptance (`invitation-accept.js`): an explicit, server-validated `termsAccepted === true` (never inferred) records a `terms_privacy` consent row with the current Terms/Privacy version stamps; a separate, optional `marketing` consent row records the actual choice (including an explicit decline) — see `src/domain/consent.js` and item #6 below.
- **Implemented:** `migrations/002_invitations_and_consent.sql` (token/consent columns and the new `consent_records` table), `src/policy/invitationLifecycle.js`, `src/db/invitationStore.js`, `src/db/consentStore.js`, `netlify/functions/invitations.js` (admin management), `netlify/functions/invitation-accept.js` (public activation). Live-verified against Neon end to end — see `docs/development/evidence/migrations/session-17-invitations-live-smoke-test.txt`.
- **Not yet built this round:** MFA for administrator accounts (explicitly required at launch per the approved directive) and optional customer MFA — tracked as follow-up work, not silently dropped. No UI exists yet for any of this either.
- **Blocked (unaffected by this decision):** F002 itself is now fully unblocked; F006/F007's Critical privacy findings (item #6 below) are separate and still open.

## 5. Data retention, deletion, backup-aging, legal holds (Master Index item 4)

- No periods or policies defined yet.
- **Blocks:** F058 (Data Retention/Export/Deletion), F059 (Platform Backup/Recovery), and is a precondition for F007 (Terms/Privacy/Consent) being accurate.

## 6. Legal/privacy/consent/security-claim wording (Master Index item 5) — **two are already open Critical audit findings, not just future work**

- **Audit F006 (Critical, open):** Privacy Policy under-discloses actual data collection.
- **Audit F007 (Critical, open):** Resend not named as a sub-processor in the Privacy Policy.
- Per the master instruction ("Do not implement architecture that conflicts with unresolved... privacy... findings"), these should be resolved or explicitly acknowledged-and-scoped-around before F007 (Terms/Privacy/Consent) and F058 (Retention/Export/Deletion) are built, since both functions' correctness depends on accurate privacy disclosure.
- **Blocks:** F007, F058.

## 7. New paid providers / infrastructure generally (Master Index item 6)

- Database (see #1), storage, email, monitoring, PDF, analytics, AI, SMS, e-signature — none formally approved yet.
- **New (Session 7):** does Square stay the payment provider, or is a webhook-capable replacement being considered? `src/webhooks/webhookVerification.js` (F057) is provider-agnostic by design specifically because this wasn't decided — whichever answer, that module is ready, but no real integration can start until the provider is confirmed.
- **Blocks:** Any function whose design assumes a specific provider (F035/F036/F040 monitoring, F053 reporting, F057 integrations, F060 AI).

## 8. Remote support tooling / device agents / automated website changes (Master Index item 7)

- Not yet decided whether these will ever be added.
- **Blocks:** Scope boundary for F044 (IT Support), F046/F047 (Security Readiness/MFA Checklist) — these should explicitly NOT imply remote-access or credential-storage capability until this is resolved (also a hard product-definition boundary per the master instruction: "not... A remote-monitoring agent... A password manager").

## 9. AI provider, data policy, budget (Master Index item 8)

- Not yet decided.
- **Blocks:** F060 (Wave 5, last anyway) and F020's "optional AI assistance" clause.

## 10. Missing individual function workbooks (new — this session)

- **Issue:** The Master Function Index references 60 individual workbooks (`F001_....xlsx` … `F060_....xlsx`) by filename. None were attached and none exist anywhere on disk in this repository or the `Requirements`/`Functions` folders searched during this session (only the two roll-up workbooks — Global Requirements, Master Function Index — were provided).
- **Options:** (a) Dylan provides the 60 individual workbooks before Session 1 begins; (b) Dylan confirms the Global Requirements + Master Function Index summaries (objective, dependencies, priority, complexity per function — already captured in `REQUIREMENTS_CATALOG.json`) are sufficient to proceed without them, at least for early Wave 1 functions.
- **Blocks:** Detailed acceptance-test and business-rule design for any function beyond what the two roll-up workbooks already specify. Does not block Session 0 itself.
