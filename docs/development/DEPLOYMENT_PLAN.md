# Deployment Plan

## How this fits the existing deploy model

Production deploys today happen by pushing `main` from whichever `vN` folder under `Business Website/Website Code/` is currently "live" to `github.com/LitTechSolutions/lit-solutions-website`, which Netlify auto-deploys. This workspace (`LTS Stand Alone Software`, copied from `v23`) shares that same git history and `origin` remote, but Business Care Hub work happens on branch `feature/business-care-hub`, never on `main`.

**Decision (Dylan, 2026-07-14): stay entirely local for the whole build.** Everything for the Business Care Hub — every session, every wave, all 60 functions — stays committed to this workspace only. No pushing to `origin`, no merging into a new `vN` folder, no merging into `main`, no Netlify deploy preview, until Dylan explicitly decides to ship. This supersedes the "two deploy paths" question raised in Session 0 — neither path is taken for now. See `DECISION_LOG.md`.

## Environments

- **Local (this workspace):** `feature/business-care-hub`, everything happens here, commits only, no deploys. This is the only environment in play for the entire build unless Dylan says otherwise.
- **Deploy preview / production:** not used for this project at this time. Revisit only when Dylan decides to ship.

## Environment variables (document name/purpose/owner/environment/rotation — never values)

Not fully inventoried yet beyond what's implied by existing code (`LTS_SESSION_SECRET` for session HMAC signing, Netlify Blobs auto-detected credentials with a `NETLIFY_BLOBS_TOKEN`/`SITE_ID` fallback, an email-provider key for Resend).

**New, added with the Postgres/Neon decision (2026-07-14):** `DATABASE_URL` (or `NEON_DATABASE_URL`) — Neon connection string, read by `src/db/pgClient.js`. Now provisioned and live-verified against a real Neon database as of Session 13 (see `sessions/SESSION_13_LIVE_DATABASE_VERIFIED.md` and every subsequent session's live smoke test). Set in local `.env` (gitignored) for development; must also be set in Netlify's environment variable UI before any production deploy — never commit its value.

**New, Session 20 (2026-07-15) — TOTP MFA (`src/security/mfaCrypto.js`, `netlify/functions/mfa-enroll.js`/`mfa-verify.js`/`mfa-manage.js`):**

- `MFA_ENCRYPTION_KEY` — a 32-byte key, **hex-encoded (64 hex characters)**, used with AES-256-GCM to encrypt every platform_admin's TOTP secret at rest (`src/security/mfaCrypto.js`'s `encryptSecret`/`decryptSecret`). This is a secret — never commit its value, never place it in frontend code, never put it in `netlify.toml`. Generate one with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Set it directly in Netlify's Site settings → Environment variables (production), and in local `.env` (gitignored) for development. **Rotation:** rotating this key invalidates every currently-encrypted TOTP secret at rest — anyone with `mfaEnabled: true` would need to go through `mfa-manage.js`'s reset flow (or a manual re-encryption migration, not yet built) after a rotation. Until that migration exists, treat rotation as a rare, deliberate, all-admins-re-enroll event, not routine hygiene.
  - `mfa-enroll.js` and `mfa-verify.js` both fail closed (throw, surfaced as a 500) if this variable is unset when a platform_admin account needs it — there is no silent fallback to an unencrypted secret.
  - Recovery codes are hashed with SHA-256 (not this key) — see `src/security/mfaCrypto.js`'s comment for why a fast hash is the correct choice there (high-entropy, server-generated, single-use values, not user-chosen passwords).

**Pre-existing, formally documented here for the first time — Session 20 step 8 (2026-07-15), outbound email (`netlify/functions/_lib/email.js`):**

- `RESEND_API_KEY` — API key from resend.com. Set in Netlify's Site settings → Environment variables (production) and in local `.env` (gitignored) for development. Never commit its value.
- `EMAIL_FROM` — e.g. `"Little Technical Solutions LLC <dylan@lit-solutions.tech>"`. The domain must be verified with Resend first (see `README_ADMIN_SETUP.md`). Not itself a secret, but keep it alongside `RESEND_API_KEY` since it's meaningless without a working API key.
- **Current behavior if either is unset: every `sendEmail()` call silently no-ops** (logs to the function console, returns `{ sent: false, reason: "not configured" }`, never throws) — this lets the whole platform work end to end without an email provider configured, at the cost of every notification being invisible unless someone checks the audit log or the underlying data (verification tokens, invitation links) directly.
- **Session 20 step 10's security review found this "fail-open by default" behavior directly relevant to its one Critical finding** (MFA enrollment has no defense against a password-only account compromise hijacking the first TOTP enrollment — see `SECURITY_REVIEW.md`). Step 8 added a best-effort security-notification email on every MFA enroll/disable/reset (`mfa-enroll.js`, `mfa-manage.js`), and — critically — every send now records its own audit event (`mfa.enroll.notification`, `mfa.disable.notification`, `mfa.reset.notification`) with `outcome: "success"` or `"failure"` and, on failure, a `reason` (e.g. `"not configured"`). **This does not fully close the Critical finding** — the underlying enrollment hijack is still possible, since a not-yet-delivered or never-configured notification can't stop an attacker who already has the pre-auth cookie — but it means `audit-log.js` now makes visible exactly when account owners were or weren't notified, rather than that gap being silent. Setting `RESEND_API_KEY`/`EMAIL_FROM` before any platform_admin account is created is the single highest-leverage step to reduce (not eliminate) this risk in practice.

## Netlify Functions / Forms

12 implemented functions documented in `API_CATALOG.md`. Netlify Forms usage not yet confirmed (see `ARCHITECTURE.md` §2 — "Requires migration (tentative)" for `intake.html`); confirm in Session 2/3 before assuming native Netlify Forms are or aren't in play.

## Storage

11 Netlify Blobs stores documented in `DATA_MODEL.md`. No backup/export/restore procedure currently documented for them — this is itself part of F059 (Platform Backup, Recovery & Continuity) and should not be assumed to exist.

## Feature flags

None exist today. `ARCHITECTURE.md` §3.7 proposes building F056 (System Settings & Feature Flags) on top of the existing `content` store's whole-record-replace pattern — new Care Hub modules should ship behind flags from the start once that exists, per `SYS-ARC-010` ("no broad production rewrite in one uncontrolled change").

## Monitoring / incident handling / rollback

Not yet defined for this codebase generally (outside this session's scope to establish) or for Care Hub specifically. `ROLLBACK_PLAN.md` covers what's known today (folder/commit-level rollback via the existing `vN` convention).

## This session

Documentation only. No deploy, no environment or provider changes, nothing pushed. Recorded Dylan's stay-local decision above.
