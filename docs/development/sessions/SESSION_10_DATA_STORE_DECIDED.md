# Session 10 — Primary Data Store Decided, F001/F005/F008 Persistence Built

**Date:** 2026-07-14
**Trigger:** Dylan checked in after Session 9's release review, was asked the single highest-leverage open question, and resolved it directly. Given bypass permission and a directive to "take care of everything without interruption," this session continues unattended from there, with the one hard constraint (stay local, nothing published) unchanged.

## What happened

Two decisions, asked and answered in sequence:
1. **Primary data store:** managed PostgreSQL (Dylan's choice, matching the architecture recommendation from Session 0).
2. **Provider:** Neon, specifically for its serverless-native HTTP driver — Netlify Functions are stateless per-invocation, and a traditional connection-pooled driver risks exhausting a database's connection limit under concurrent invocations the way an HTTP-per-query driver doesn't.

Both recorded in `OWNER_DECISIONS.md` and `DECISION_LOG.md`, then acted on immediately:

- Installed `@neondatabase/serverless` — the first new dependency this project (or the underlying site) has ever had beyond `@netlify/blobs`.
- Wrote `migrations/001_initial_schema.sql` — a complete relational schema, one table per already-built domain type across Sessions 1–7 (~28 tables: organizations, memberships, invitations, tickets, approvals, scope-of-work, change orders, payment requests, subscriptions, technology assets, lifecycle reminders, website profiles, check results, incidents, backups, checklists, templates, and more). This was fast and low-risk specifically *because* every entity already had a precise, tested domain type from prior sessions — the schema is a direct translation, not new design work.
- Built `src/db/pgClient.js` (shared connection helper, mirrors the existing `_lib/blob_store.js` pattern) and real persistence for the three functions everything else depends on:
  - **F001** (`organizationStore.js`) — create/get/update organizations.
  - **F005** (`membershipStore.js`) — and specifically `resolveAuthorizationContext()`, which is the first genuine end-to-end wiring in this project: it resolves a user's real membership into exactly the shape `rbac.js`'s pure `authorize()` expects. Three integration tests prove real-shaped data flows correctly into the policy engine, including the suspended-membership case Session 1 fixed.
  - **F008** (`pgAuditSink.js`) — a drop-in replacement for `blobsAuditSink.js`, implementing the same `AuditSink` interface `createAuditRecorder()` (Session 1) was built against. Zero changes needed to the recorder. This is exactly why F008 was built against an interface back in Session 1 rather than coupled directly to Blobs — the payoff showed up this session.

All three adapters are dependency-injection-testable (`deps.sql` defaults to the real Neon client, tests inject a fake tagged-template function) — 23 new tests, all passing, none requiring a live database. **No live Neon project exists in this environment**, so none of this has executed against a real database yet — that's flagged as the top remaining risk, not glossed over.

Updated `ARCHITECTURE.md`, `DATA_MODEL.md`, `MIGRATION_PLAN.md`, and `DEPLOYMENT_PLAN.md` to reflect the decision and its consequences (new `DATABASE_URL` environment variable, updated migration next-steps). Added `.env`/`.env.*` to `.gitignore` proactively, since a local Neon connection string will need one eventually and no secret-handling gap should exist even briefly.

## Code written

- `migrations/001_initial_schema.sql` — full schema.
- `src/db/pgClient.js`, `organizationStore.js` (+test), `membershipStore.js` (+test), `pgAuditSink.js` (+test).

259 total unit tests now, up from 236, all passing.

## Tests run

`npm test` → 259/259 passing. `evidence/tests/session-10-persistence-layer.txt`.

## Files changed

New: `migrations/001_initial_schema.sql`, `src/db/pgClient.js`, `organizationStore.js` (+test), `membershipStore.js` (+test), `pgAuditSink.js` (+test), `evidence/tests/session-10-persistence-layer.txt`, this file. Modified: `package.json`/`package-lock.json` (new dependency), `.gitignore`, `OWNER_DECISIONS.md`, `DECISION_LOG.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `MIGRATION_PLAN.md`, `DEPLOYMENT_PLAN.md`, `REQUIREMENTS_TRACEABILITY.md`, `DEV_STATE.json`, `DEV_INDEX.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`. Nothing pushed.

## What's still needed before this is trusted in any deployed environment

1. Dylan provisions an actual Neon project and database.
2. `DATABASE_URL` set as a Netlify environment variable (never committed — `.env` is now gitignored).
3. Run `migrations/001_initial_schema.sql` against the real database.
4. Re-run `organizationStore`/`membershipStore`/`pgAuditSink`'s underlying logic against the live connection (currently only exercised via fake injected clients).

## Next highest-leverage owner decision

Pricing (`OWNER_DECISIONS.md` #2) — F026, F027, F028, F050, and F052 are all engine-complete and tested, waiting only on real price/discount values. Resolving it would unblock five functions' worth of persistence + real-value wiring in one pass, the same way the data-store decision just unblocked F001/F005/F008.
