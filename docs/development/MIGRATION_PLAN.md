# Migration Plan

No migration has been executed. This document establishes the protocol future sessions must follow, per the Data Standards sheet, and inventories what a first real migration (retrofitting existing Blobs records with `organization_id` once F001 exists) will need to account for.

## Protocol (mandatory for every future migration, per Global Requirements)

1. Inventory current routes, functions, Blobs/stores, environment variables, file providers, customer records, and duplicated configuration.
2. Create a source-to-target mapping; identify records that cannot be migrated automatically.
3. Back up and export existing production data before schema changes.
4. Run the migration against a production-like copy; validate record counts, tenant ownership, important totals, hashes, and relationships.
5. Use reversible migrations or a documented compensating rollback.
6. Deploy behind feature flags; dual-read or controlled cutover only when needed.
7. Run production smoke and tenant-isolation tests immediately after cutover.
8. Keep old data read-only until reconciliation and the rollback window close.

## Known future migration: retrofitting `organization_id`

Once F001 defines the organization entity, every existing customer-owned record needs an ownership path added:

| Store | Current owner key | Migration needed |
|---|---|---|
| `documents` | `customerId` | Map each `customerId` to its (new) organization, backfill `organization_id` |
| `messages` | `customerId` | Same |
| `favorites` | `userId` | Same, plus decide whether favorites are per-user or per-org |
| `notifications` | `userId` | Same |
| `leads` | email match | Different shape — leads predate any account; needs its own reconciliation rule, likely tied to `project-status`'s existing "verified-email-only matching" security rule |
| `users` | — | Needs a new `organization_memberships` relationship, not just a field added to the existing record |

This is explicitly **not** scoped or scheduled by Session 0 — it's Wave 1 work, and it can't be designed in detail until the primary-data-store owner decision (`OWNER_DECISIONS.md` #1) is resolved, since the mechanics differ substantially between "Blobs with composite keys" and "Postgres with foreign keys."

## Known future migration: primary data store (if Postgres is chosen)

If the owner decision in `OWNER_DECISIONS.md` #1 lands on introducing PostgreSQL, that migration is large enough to warrant its own dedicated planning document before any code is written — this file will be superseded/expanded at that point, following the same 8-step protocol above with Blobs as the source and Postgres as the target.

## No migration is scheduled from this session

Session 0 makes no schema changes and touches no production or customer data.
