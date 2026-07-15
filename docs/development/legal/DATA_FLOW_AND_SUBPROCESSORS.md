# Care Hub data-flow and sub-processor inventory

**Status: DRAFT reference document, not legal text itself.** This is
the factual basis for the Privacy Policy and launch checklist drafts in
this folder. Update it whenever the schema, dependencies, or
integrations actually change — it should always describe what the code
does today, not what's planned.

## 1. Data collected, by category

Source: `migrations/001_initial_schema.sql`, `002_invitations_and_consent.sql`,
`004_checklist_customer_staff_split.sql` (Neon/Postgres), plus the
legacy Netlify Blobs stores the platform already used before the Care
Hub existed.

### 1.1 Identity & account data

| Data | Where | Notes |
|---|---|---|
| Name, email, password hash (scrypt) | Blobs `users` store | Pre-existing, not new to the Care Hub |
| Organization membership, role (`org_owner`/`org_member`/`read_only_customer`/`platform_admin`) | Postgres `organizations`, `organization_memberships` | New — no tenant concept existed before Session 1 |
| Session tokens | Blobs `sessions`, cookie `lts_session` (HMAC-signed, 8h TTL, server-revocable) | Pre-existing |
| Invitation tokens | Postgres `invitations` | SHA-256 hashed, single-use, 7-day expiry, invite-only registration (Session 17 owner decision) |
| TOTP MFA secret | Blobs `users` store, AES-256-GCM encrypted at rest (`MFA_ENCRYPTION_KEY`) | platform_admin accounts only; Postgres stores only the last atomically consumed TOTP counter |
| MFA recovery codes | Blobs `users` store plus Postgres `mfa_recovery_codes`, SHA-256 hashed | platform_admin accounts only; Postgres is authoritative for one-time atomic consumption |
| MFA enrollment email challenges | Postgres `mfa_enrollment_challenges` | Raw emailed tokens are never stored; SHA-256 hashes are expiring and atomically consumed |
| Consent records (terms/privacy acceptance, marketing opt-in) | Postgres `consent_records` | Version-stamped (`CURRENT_TERMS_VERSION`/`CURRENT_PRIVACY_VERSION`) |

### 1.2 Customer operations data

| Data | Where |
|---|---|
| Tickets (subject, description, category, status history) | Postgres `tickets`, `triage_results`, `priority_assessments`, `assignments`, `time_entries`, `internal_notes` |
| Readiness checklist answers (customer- and staff-facing items, comments, staff notes, verification status) | Postgres `checklist_definitions`, `checklist_responses`, `checklist_submissions` |
| Service records | Postgres `service_records` |
| Approval requests | Postgres `approval_requests` |
| Activity/audit timeline | Postgres `activity_events`, `audit_events` |
| Scope-of-work documents, change orders, payment requests | Postgres `scope_of_work`, `change_orders`, `payment_requests` |
| Entitlements / plan usage | Postgres `entitlement_limits`, `usage_records`, `price_sheets`, `subscriptions` |

### 1.3 Files and messages

| Data | Where |
|---|---|
| Uploaded documents (as base64 data URIs) | Blobs `documents` store; Postgres `care_hub_documents`/`file_assets` reference metadata | Object-storage provider decided (Cloudinary, `OWNER_DECISIONS.md` #11) but not yet integrated — still base64-in-Blobs today |
| Messages between customer and staff | Blobs `messages` store; Postgres `message_thread_refs` | |
| Favorites, notification preferences | Blobs `favorites`; Postgres `notification_preferences` | |

### 1.4 Technology and security data

| Data | Where |
|---|---|
| Technology assets (devices, software, licenses) | Postgres `technology_assets` |
| Lifecycle reminders (renewal/expiry dates) | Postgres `lifecycle_reminders` |
| Website profiles, uptime/incident/backup records | Postgres `website_profiles`, `website_check_results`, `incident_records`, `backup_records` |
| IT support classification (remote/on-site/safety) | Postgres `it_support_classifications` |

### 1.5 Payments

| Data | Where |
|---|---|
| Payment request status, provider reference ID | Postgres `payment_requests` | **No card data is ever collected or stored.** Square (planned processor, Sandbox integration not yet built) would handle actual card data directly, same as the existing site. |
| Webhook events from payment provider | Postgres `webhook_events` | Signature-verified (HMAC + replay window); not yet receiving live Square events |

### 1.6 Analytics and logs

| Data | Where |
|---|---|
| Structured audit events (who did what, when, to what) | Postgres `audit_events` via `pgAuditSink.js` | Every state-changing write is audited (F008) |
| IP addresses | Rate-limiting only, Blobs `ratelimit` store (`action:IP` keys) | Not tied to a user profile beyond throttling abuse |
| Operational metrics | Postgres `metric_events` | Aggregate, not per-user tracking |

### 1.7 Not yet active — do not describe as live

- **AI Assistance (F060)** — approved in principle (OpenAI, capped
  budget) but no integration exists. No data currently flows to an AI
  provider.
- **Square live integration** — schema and webhook plumbing exist;
  no live Sandbox or production API calls are made yet. A static Square
  Payment Link is used as a manual, non-integrated development stopgap
  in `care-hub-app` (see `SECURITY_REVIEW.md`/session docs) — this does
  not touch `payment_requests` at all and is not a live integration.
- **Cloudinary** — decided as the object-storage provider (owner
  decision #11) but not yet integrated; uploaded files are still
  base64-in-Blobs. Do not disclose as an active processor until the
  actual migration code exists.

## 2. Sub-processors (third parties that touch this data)

**Update (Session 20 step 8): `privacy.html` and `terms.html` were
merged with these disclosures directly** — audit findings F006/F007 are
resolved (`docs/audit/AUDIT_STATE.json`). The "disclosed?" columns below
are now historical context for how that merge happened, not an open
gap.

| Sub-processor | What it processes | Disclosed on the public site? |
|---|---|---|
| **Netlify** | Hosting, Netlify Functions (serverless compute), Netlify Blobs (legacy data store + some Care Hub storage), Netlify Analytics | Yes (`privacy.html` §1, §3) |
| **Neon** (managed PostgreSQL) | All new Care Hub relational data (see §1 above) | Yes (`privacy.html` §1, §3, merged Session 20 step 8) |
| **Resend** | Transactional email (account notifications, invitations, ticket updates, MFA security notifications) via `RESEND_API_KEY` → `api.resend.com` | Yes (`privacy.html` §3, merged Session 20 step 8 — closes F007) |
| **Square** | Payment processing (planned; not live yet; a static dev Payment Link is used as a manual stopgap, not integrated with `payment_requests`) | Yes (`privacy.html` §1, §3) |
| OpenAI (F060, not started) | Would process AI Assistance queries if/when built | Not disclosed — not active, nothing to disclose yet |
| Cloudinary (decided, not integrated) | Would process uploaded file storage if/when built | Not disclosed — not active, nothing to disclose yet |

## 3. Data NOT collected

Carried forward from the existing site's disclosures and confirmed
still true for the Care Hub:

- No payment card numbers, CVVs, or bank account numbers are ever
  collected or stored by this platform.
- No advertising cookies or cross-site tracking.
- No sale of personal information to third parties.

## 4. Retention (approved defaults, not yet technically enforced)

Approved by Dylan in Session 17 (`SESSION_17_INVITE_ONLY_REGISTRATION.md`,
`DEV_STATE.json`) — **these are policy targets, not yet implemented as
automated deletion jobs**. The launch checklist tracks closing this gap.

| Data category | Retention target |
|---|---|
| Closed-account files | 30 days after account closure |
| Abandoned leads | 12 months |
| Closed tickets | 24 months |
| Financial records (payment requests, invoices) | 7 years |
| Backups | 90-day rolling window |

## 5. Keep this document current

Whoever works the next session touching `migrations/`, `package.json`
dependencies, or any `netlify/functions/_lib/*` integration (email,
payments, AI) should update this file in the same commit. Treat drift
between this document and the real schema/code as a launch blocker, not
a documentation nice-to-have — it's exactly the class of bug that
produced F006/F007 in the first place.
