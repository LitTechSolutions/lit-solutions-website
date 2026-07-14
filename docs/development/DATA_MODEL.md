# Data Model — Current State & Target Standards

## 1. Current Netlify Blobs schema (as inspected)

Wrapper: `netlify/functions/_lib/blob_store.js`, `@netlify/blobs` `getStore()`, `consistency: "strong"`.

| Store | Key | Record shape | Lookup pattern |
|---|---|---|---|
| `users` | email (lowercased) | `{ id, email, name, passwordHash, role, verified, createdAt, preferences }` | Direct get by email |
| `sessions` | sessionId | `{ userId, expiresAt, role }` | Direct get by sessionId |
| `tokens` | token string | `{ type, userId, used }` | Direct get; single-use (verify-email, password-reset) |
| `content` | slug | `{ data: [...], updatedAt, updatedBy }` | Direct get by slug; whole-array replace on write |
| `images` | imageId | `{ dataUri, alt, caption, uploadedBy, uploadedAt }` | Direct get; `list()` for library view |
| `documents` | documentId | `{ customerId, customerEmail, title, type, amount, status, date, notes, fileDataUri, fileName, uploadedBy, uploadedAt }` | `list()` + filter by `customerId`/`customerEmail` |
| `messages` | messageId | `{ customerId, customerEmail, from, fromName, body, createdAt, readByStaff, readByCustomer }` | `list()` + filter by `customerId` to reconstruct threads |
| `favorites` | userId | `{ items[], recentlyViewed[], savedSearches[] }` | Direct get by userId, one record per user |
| `notifications` | notificationId | `{ userId, title, body, href, read, createdAt }` | `list()` + filter by `userId` |
| `ratelimit` | `action:ip` | `{ count, windowStart }` | Direct get |
| `leads` | submission id (`WD-...`) | Website Designer quote/brief fields | `list()` + filter |

**No secondary indexes exist anywhere.** Every "find by X" that isn't the primary key is a full `list()` scan with in-memory filtering. This is the practical ceiling this schema hits before Business Care Hub scale (orgs × tickets × scopes × approvals × payments × plans, with staff-side filtering/search/pagination across all of it per F011/F020/F051).

**No `organization_id` field exists on any record.** Every customer-owned record is keyed directly to a `userId` — the tenant boundary the entire Global Requirements package assumes (`SYS-AUTH-003`: "Every customer-owned record has an organization ownership path checked on every read and write") does not exist yet.

## 2. Target common data model (per Data Standards sheet — not yet implemented)

Every new Business Care Hub entity should carry:

| Field | Meaning | Requirement |
|---|---|---|
| `id` | Opaque server-generated UUID/ULID | Required, immutable |
| `organization_id` | Tenant owner | Required where customer-owned; indexed; authorization-checked on every access |
| `created_at` / `updated_at` | UTC timestamps | Server-generated |
| `created_by` / `updated_by` | User or automated-service identity | Required for material changes |
| `status` | Domain state | Validated against a versioned workflow |
| `version` | Optimistic concurrency | Required for mutable/approved/contractual/report records |
| `archived_at` / `deleted_at` | Lifecycle marker | Distinct from hard deletion |
| `source` / `source_id` | Originating workflow/provider reference | Reconciliation/traceability |
| `correlation_id` | Cross-service trace | Present on significant operations |
| `metadata` | Approved typed extension fields only | No arbitrary secret-bearing JSON |

None of the current 11 stores' record shapes include `organization_id`, `version`, or `correlation_id`. Retrofitting existing records (`documents`, `messages`, `notifications`, `favorites`, `leads`) to the target shape — once F001 defines what an "organization" is — is itself a migration, not a greenfield add; see `MIGRATION_PLAN.md`.

## 3. Primary data store — open question

Whether the target model above lives in an extended Netlify Blobs schema (hand-rolled composite keys like `org:{orgId}:tickets:{ticketId}` for pseudo-indexing) or a managed relational database is an **owner decision** — see `ARCHITECTURE.md` §3.3 and `OWNER_DECISIONS.md`. This document's target shape applies either way; only the storage mechanics differ.

## 4. Privacy data categories (per Global Requirements — for retention/consent design, not yet implemented)

| Category | Examples | Retention principle |
|---|---|---|
| Identity & Account | Name, email, phone, role, membership, preferences, session metadata | Account life + approved retention |
| Customer Operations | Organizations, projects, tickets, messages, approvals, work history, plan usage | Contract/service history policy |
| Files & Documents | Uploads, agreements, invoices, receipts, reports, website assets | Category-specific, private storage |
| Technology & Security | Website records, domains, assets, service history, readiness metadata | While managed + approved history |
| Payments | Provider references/status only, no full card data | Financial retention policy |
| Analytics & Logs | First-party events, audit events, sanitized operational logs | Minimized, time-bounded |
| AI Assistance | Approved redacted context, drafts, provider/model metadata, review decision | Short/minimized unless approved draft becomes a record |

Actual retention periods for each category are owner-controlled (§8 of the master instruction) and unset today — flagged in `OWNER_DECISIONS.md`.
