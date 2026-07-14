# Test Strategy

## Starting point

Zero automated tests exist anywhere in this repository today (confirmed: no jest/playwright/cypress config, no `test/` directory, no `scripts` key in `package.json`; also independently confirmed as open audit finding F016). This is a from-zero build, not an extension of existing coverage.

## Target coverage (per Testing & Quality sheet)

| Layer | Required coverage | Minimum scope |
|---|---|---|
| Unit | Pricing, entitlement, workflow, priority, validation, state transition, redaction, formatting, calculation rules | Every deterministic rule and edge case |
| Repository/Service Integration | Store adapters, migrations, transactions, indexes, concurrency, idempotency | Success, failure, retry, duplicate, rollback |
| Authorization Integration | Role, tenant, object, internal/customer projection, file/download, export, search, notification target | Positive and negative two-tenant matrix (Org A, Org B, owner, member, staff, suspended) |
| API/Function | Schemas, safe errors, rate limits, correlation IDs, webhook signatures, provider adapters | Synthetic provider and malformed input |
| Component | Forms, conditional fields, state views, keyboard, focus, errors, loading, localization | Critical components and edge states |
| End-to-End | Customer request through triage, approval, payment, work, closure, report, history | MVP golden paths and major failure branches |
| Accessibility | Automated scan + keyboard, screen reader, 200% zoom, contrast, reduced motion, mobile touch | Every critical customer/staff workflow |
| Performance | Bundle size, LCP, API latency, query count/indexes, job duration, provider impact | Production-like data, ordinary mobile profile |
| Security | Tenant isolation, auth/session, CSRF, injection, file abuse, replay, privilege escalation, secret scan | Before production and after high-risk changes |
| Recovery | Backup, restore, migration rollback, provider outage, failed deployment, idempotent job replay | Scheduled exercise and release-critical changes |
| Content Reconciliation | Prices, discounts, plan terms, contact info, service areas, legal/privacy, testimonials, portfolio | Before every public release touching business content |

## Tooling decision (needed before Session 1's first test, not decided here)

No test runner is installed. Recommendation, consistent with this codebase's existing minimal-dependency bias (`ARCHITECTURE.md` §3.1, §3.8):

- **Unit/integration:** Node's built-in `node --test` (Node 24.18.0 confirmed installed) — zero new dependency for the layers that matter most first (pricing, entitlement, workflow rules).
- **Authorization/API integration:** same `node --test`, hitting the Netlify Functions handlers directly (they're plain Node modules) with mocked Blobs stores — no need for a running dev server for this layer.
- **E2E/accessibility/component:** defer the tooling decision until Wave 2 (customer workspace UI exists to test); Playwright is the likely candidate given its accessibility-tree and multi-browser support, but this is a real dependency addition and should be a visible decision at that time, not assumed now.

## Release gates (per Testing & Quality sheet — apply from Wave 1 onward)

1. Production build succeeds; no unresolved critical console/import/type/migration/secret-scan failures.
2. All Must requirements for the release wave have traceable pass evidence or explicit owner-approved block.
3. Tenant-isolation and permission negative tests pass for every affected data type.
4. Critical workflows pass mobile, keyboard, screen-reader, 200% zoom, and provider-failure tests.
5. Pricing, entitlement, payment, approval, and legal/privacy content are reconciled to approved sources.
6. Deploy preview, migration dry run, backup, rollback, production smoke test, and monitoring plan are complete.

## This session

No code exists yet to test. No tests were run beyond confirming no test tooling is present (see `evidence/`).
