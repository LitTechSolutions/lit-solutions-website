# Migration Plan

Primary data store decided 2026-07-14: PostgreSQL on Neon (see `OWNER_DECISIONS.md` #1, `ARCHITECTURE.md` §3.3). `migrations/001_initial_schema.sql` is written — a greenfield schema for new Care Hub entities, not a migration of existing production data — and has **not been run against a live database**, since no Neon project has been provisioned yet in this environment. This document tracks that as the next infrastructure step, plus the still-pending Blobs-record retrofit migration below.

## Protocol (mandatory for every future migration, per Global Requirements)

1. Inventory current routes, functions, Blobs/stores, environment variables, file providers, customer records, and duplicated configuration.
2. Create a source-to-target mapping; identify records that cannot be migrated automatically.
3. Back up and export existing production data before schema changes.
4. Run the migration against a production-like copy; validate record counts, tenant ownership, important totals, hashes, and relationships.
5. Use reversible migrations or a documented compensating rollback.
6. Deploy behind feature flags; dual-read or controlled cutover only when needed.
7. Run production smoke and tenant-isolation tests immediately after cutover.
8. Keep old data read-only until reconciliation and the rollback window close.

## Next infrastructure step: provision Neon and run `001_initial_schema.sql`

This is a greenfield migration (no existing production data occupies these tables), so steps 3–4 of the protocol above are trivially satisfied (nothing to back up, nothing to reconcile counts against) — but steps 6–7 still apply once real:

1. Dylan provisions a Neon project and database.
2. `DATABASE_URL` (or `NEON_DATABASE_URL`) is set as a Netlify environment variable — see `DEPLOYMENT_PLAN.md`.
3. Run `migrations/001_initial_schema.sql` against the new database (via Neon's console/CLI or a one-off script — no migration-runner tool is set up yet; a lightweight one should be chosen before a second migration file exists, to avoid manually tracking "what's been run").
4. Smoke test: run `organizationStore.test.js`, `membershipStore.test.js`, and `pgAuditSink.test.js`'s underlying functions against the real database (they currently run against a fake injected `sql` function — the same test *logic* should be re-run with `deps.sql` omitted, i.e. hitting `getSql()` for real, before this is trusted in any deployed environment).
5. Confirm `psql \dt` (or equivalent) shows all ~28 tables from the migration file.

## Known future migration: retrofitting `organization_id` onto existing Blobs records

Once F001 has real organizations (the schema exists; provisioning is the remaining step above), every existing customer-owned Blobs record needs an ownership path added:

| Store | Current owner key | Migration needed |
|---|---|---|
| `documents` | `customerId` | Map each `customerId` to its (new) organization, backfill `organization_id` — or migrate the record itself into the new `care_hub_documents` Postgres table, retiring the Blobs `documents` store |
| `messages` | `customerId` | Same decision: backfill in place vs. migrate to Postgres (no `messages` table exists in `001_initial_schema.sql` yet — F013 was left as "types only, existing `messages.js` reused as-is" through Session 6; revisit now that Postgres exists) |
| `favorites` | `userId` | Same, plus decide whether favorites are per-user or per-org |
| `notifications` | `userId` | Same |
| `leads` | email match | Different shape — leads predate any account; needs its own reconciliation rule, likely tied to `project-status`'s existing "verified-email-only matching" security rule |
| `users` | — | Needs a new `organization_memberships` relationship — this now exists as `organization_memberships` in Postgres (`migrations/001_initial_schema.sql`); the missing piece is backfilling real rows for existing `users` records, which requires knowing which organization each existing customer belongs to (a business/data question, not just a technical one) |

Not scheduled yet — this is real Wave 1/2 work now that the schema exists, but should follow once real endpoints exist to exercise it, not run speculatively against a still-empty database.

## No migration has been run

`001_initial_schema.sql` is written and reviewed but not executed against any database — production and this workspace's local state are both untouched.
