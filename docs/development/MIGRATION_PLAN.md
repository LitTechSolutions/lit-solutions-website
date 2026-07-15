# Migration Plan

Primary data store decided 2026-07-14: PostgreSQL on Neon (see `OWNER_DECISIONS.md` #1, `ARCHITECTURE.md` §3.3). `migrations/001_initial_schema.sql` **has been run against the live Neon database** (2026-07-14) — 37 tables confirmed present via an `information_schema.tables` query, and a 4-function live smoke test (F001 → F005 → F008 → F019/F023) passed end to end. See `evidence/migrations/session-13-live-smoke-test.txt`. This was a greenfield migration (no existing production data occupied these tables), so protocol steps 3–4 below were trivially satisfied. This document now tracks the still-pending Blobs-record retrofit migration and the no-migration-runner-tool gap.

**Note on how it was run:** no migration-runner tool exists yet, so the SQL file was executed via a one-off Node script (split into individual statements, each run through `@neondatabase/serverless`'s `sql.query()`), then deleted after use. A real runner (even a minimal one — e.g. tracking applied migrations in a `schema_migrations` table) should be adopted before a second migration file is ever created, to avoid manually tracking what's been run.

## Protocol (mandatory for every future migration, per Global Requirements)

1. Inventory current routes, functions, Blobs/stores, environment variables, file providers, customer records, and duplicated configuration.
2. Create a source-to-target mapping; identify records that cannot be migrated automatically.
3. Back up and export existing production data before schema changes.
4. Run the migration against a production-like copy; validate record counts, tenant ownership, important totals, hashes, and relationships.
5. Use reversible migrations or a documented compensating rollback.
6. Deploy behind feature flags; dual-read or controlled cutover only when needed.
7. Run production smoke and tenant-isolation tests immediately after cutover.
8. Keep old data read-only until reconciliation and the rollback window close.

## ✅ Completed: Neon provisioned, `001_initial_schema.sql` run (2026-07-14)

1. ✅ Dylan provisioned a Neon project and database, and provided the connection string via a local `.env` file (never pasted into chat — see `DECISION_LOG.md` for how this was handled, including a rejected prompt-injection attempt encountered along the way).
2. ✅ `DATABASE_URL` set in `.env` (gitignored; **not** yet set as a Netlify environment variable, since nothing is deployed — that's a separate step for when a real endpoint exists).
3. ✅ Ran `migrations/001_initial_schema.sql` — all 65 DDL statements executed successfully via a one-off runner script.
4. ✅ Confirmed via `information_schema.tables`: all 37 tables present.
5. ✅ Live smoke test: `organizationStore` (F001), `membershipStore` → `rbac.authorize()` (F005), `pgAuditSink` via `createAuditRecorder()` (F008), `ticketStore` create + transition (F019/F023) — all passed against the real database. `evidence/migrations/session-13-live-smoke-test.txt`.

**Still open:** only 5 of 21 persistence functions have been individually live-smoke-tested; the other 16 have their tables confirmed present and matching the migration, but haven't been individually exercised live yet. Lower risk than before, not zero — worth closing before heavy reliance on any single one of them.

**The live database now contains harmless smoke-test data** (one org named "Smoke Test Org", one membership, one audit event, one ticket) — worth knowing before assuming the database is empty in any future session.

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

## Status

`001_initial_schema.sql` has been executed against the live Neon database (not production — this is a dedicated new database for the Care Hub, and `v23`/production remain completely untouched, as always).
