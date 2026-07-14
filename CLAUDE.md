# Little Technical Solutions LLC — Project Reference

Stable facts every session should be able to rely on without re-deriving
them from the repository. Update this file only when one of these facts
actually changes.

## Business identity

- **Business:** Little Technical Solutions LLC
- **Owner/founder:** Dylan Little
- **Contact:** dylan@lit-solutions.tech · 636-426-0289
- **Primary local service area:** Montross, Colonial Beach, King George,
  Dahlgren, VA, and surrounding Northern Neck communities (on-site work).
  Website design services are offered nationwide, remote.
- **Veteran-owned:** Dylan served six years in the U.S. Navy as a Fire
  Controlman, including ~4 years aboard **USS Antietam (CG-54)** — not
  CG-64 (corrected across the site and all 16 languages, see commit
  `9a753a6`).
- **Education:** B.S. in Cybersecurity Technology, University of Maryland
  Global Campus. Also works professionally in systems engineering.
- **Positioning:** a local, personally-accountable technology partner for
  websites, computers, networking, cybersecurity, and small-business IT —
  not primarily an "AI website company." Do not exaggerate credentials,
  business age, staffing, or response capacity in any customer-facing copy.

## Versioning convention

- Each site revision lives in its own folder under `Business Website/
  Website Code/vN` (currently `v23`), copied forward from the previous
  version — never edited in place. Each version folder is its own git
  repo pointed at the same GitHub remote
  (`LitTechSolutions/lit-solutions-website`), so pushing from the current
  version's folder is what actually deploys.
- The in-page "Website Version" footer string (visible on all 33 public
  pages) follows semver: **major** = large redesign/rework, **minor** =
  feature addition, **patch** = bug/security fix only. Current: `3.2.2`.
- There is no build step and no shared include/template mechanism, so a
  version bump (or any header/footer change) means editing the string in
  all 33 public HTML files directly — this repo has done that via a
  scripted `sed` sweep on every release so far.

## Architecture summary

- **Static, build-less, multi-page site.** One `.html` file per URL, no
  client-side router, no bundler for the frontend. `netlify.toml` has no
  `command` — the repo root is published as-is.
- **Netlify Functions** (`netlify/functions/`, bundled with esbuild at
  deploy time only) provide the backend: customer accounts, staff admin,
  messaging, documents, favorites, notifications, content management, and
  the Website Designer quote tool. 12 real implemented handlers exist;
  9 additional folders (`website-audit`, `referral-program`,
  `quote-session`, `project-status`, `project-scaffold-generator`,
  `booking-scheduler`, `lead-followup`, `leads-dashboard`,
  `quote-acceptance`) are spec-only (`REQUIREMENTS.md`, no code).
- **Netlify Blobs** is the data store (11 stores: users, sessions, tokens,
  content, images, documents, messages, favorites, notifications,
  ratelimit, leads) via a shared `_lib/blob_store.js` wrapper.
- **16 languages** via a client-side swap (`js/i18n.js`, `data-i18n`
  attributes, one URL per page, dictionaries fetched on-demand per
  language — no hreflang, since there are no separate per-language URLs).
- **Automated tests**: `test/` (node's built-in `node:test`, run via
  `npm test`) covers the Website Designer pricing/discount math
  (`recomputeEstimate`/`priceMismatchFlag`) and a static consistency check
  that heroes-pricing.html's hand-typed Heroes Discount prices actually
  match `was * (1 - rate)`. No other suites (no jest/playwright/cypress).

## Active audit record

A structured, multi-session audit of this platform is tracked under
`docs/audit/` — see **`docs/audit/AUDIT_INDEX.md`** for the current state
and **`docs/audit/00_AUDIT_CONTROL.md`** for the process/ground rules.
Read those before starting any new audit session rather than re-deriving
architecture facts from scratch.
