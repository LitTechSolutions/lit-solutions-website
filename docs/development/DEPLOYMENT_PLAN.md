# Deployment Plan

## How this fits the existing deploy model

Production deploys today happen by pushing `main` from whichever `vN` folder under `Business Website/Website Code/` is currently "live" to `github.com/LitTechSolutions/lit-solutions-website`, which Netlify auto-deploys. This workspace (`LTS Stand Alone Software`, copied from `v23`) shares that same git history and `origin` remote, but Business Care Hub work happens on branch `feature/business-care-hub`, never on `main`.

**Decision (Dylan, 2026-07-14): stay entirely local for the whole build.** Everything for the Business Care Hub — every session, every wave, all 60 functions — stays committed to this workspace only. No pushing to `origin`, no merging into a new `vN` folder, no merging into `main`, no Netlify deploy preview, until Dylan explicitly decides to ship. This supersedes the "two deploy paths" question raised in Session 0 — neither path is taken for now. See `DECISION_LOG.md`.

## Environments

- **Local (this workspace):** `feature/business-care-hub`, everything happens here, commits only, no deploys. This is the only environment in play for the entire build unless Dylan says otherwise.
- **Deploy preview / production:** not used for this project at this time. Revisit only when Dylan decides to ship.

## Environment variables (document name/purpose/owner/environment/rotation — never values)

Not fully inventoried yet beyond what's implied by existing code (`LTS_SESSION_SECRET` for session HMAC signing, Netlify Blobs auto-detected credentials with a `NETLIFY_BLOBS_TOKEN`/`SITE_ID` fallback, an email-provider key for Resend).

**New, added with the Postgres/Neon decision (2026-07-14):** `DATABASE_URL` (or `NEON_DATABASE_URL`) — Neon connection string, read by `src/db/pgClient.js`. **Not yet set anywhere** — no Neon project has been provisioned in this environment. Required before any of `organizationStore.js`, `membershipStore.js`, or `pgAuditSink.js` can run against a real database (they currently only run against fake injected `sql` functions in tests). This is a secret — never commit its value; set it only in Netlify's environment variable UI (or local `.env`, gitignored) once Dylan provisions the Neon project.

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
