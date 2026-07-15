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
