# Little Technical Solutions LLC — Project Reference

Stable facts every session should be able to rely on without re-deriving
them from the repository. Update this file only when one of these facts
actually changes.

## Business identity

- **Business:** Little Technical Solutions LLC
- **Owner/founder:** Dylan Little
- **Contact:** dylan@lit-solutions.tech · 804-309-0968
- **Primary local service area:** Montross, Colonial Beach, King George,
  Dahlgren, VA, and surrounding Northern Neck communities (on-site work).
  Website design services are offered nationwide, remote.
- **Veteran-owned:** Dylan served six years in the U.S. Navy as a Fire
  Controlman, including ~4 years aboard **USS Antietam (CG-54)** — not
  CG-64 (corrected site-wide, see commit `9a753a6`).
- **Education:** B.S. in Cybersecurity Technology, University of Maryland
  Global Campus. Also works professionally in systems engineering.
- **Positioning:** a local, personally-accountable technology partner for
  websites, computers, networking, cybersecurity, and small-business IT —
  not primarily an "AI website company." Do not exaggerate credentials,
  business age, staffing, or response capacity in any customer-facing copy.
- **Founder-bio fact duplication (audit F036, Info severity, no build
  step to de-duplicate through):** the facts above — Navy years, ship
  name/hull number, degree, university — are hand-typed independently in
  `about.html` (photo caption, founder lede, credential cards),
  `index.html` (homepage lede, credential cards), `team.html` (founder
  bio line), and `testimonials.html` (credential cards). If any of these
  facts ever change again, this is the checklist of every location that
  needs the same edit — the CG-64→CG-54 correction (`9a753a6`) already
  had to be done as a manual sweep across all of them once.

## Versioning convention

- Each site revision lives in its own folder under `Business Website/
  Website Code/vN` (currently `v25`), copied forward from the previous
  version — never edited in place. Each version folder is its own git
  repo pointed at the same GitHub remote
  (`LitTechSolutions/lit-solutions-website`), so pushing from the current
  version's folder is what actually deploys.
- The in-page "Website Version" footer string (visible on all 33 public
  pages) follows semver: **major** = large redesign/rework, **minor** =
  feature addition, **patch** = bug/security fix only. Current: `4.0.0`
  (v25 is the Apple-inspired visual redesign + i18n removal).
- There is no build step and no shared include/template mechanism, so a
  version bump (or any header/footer change) means editing the string in
  all 33 public HTML files directly — this repo has done that via a
  scripted `sed` sweep on every release so far.

## Release blog posts

- Every **major** version bump (X.0.0) should get a customer-facing blog
  post announcing it — real screenshots, written in terms of the benefit
  to the customer, not a technical changelog (that's what `patch-notes.html`
  is for). This does not apply to minor/patch bumps.
- `scripts/new-release-post.js` (run via `npm run new-release-post --
  --slug ... --title ... --excerpt ... --screenshot <url> ...`) automates
  everything mechanical: it screenshots the URLs you pass it (via
  Playwright, cookie banner auto-dismissed), generates `<slug>.html` from
  the site's standard article template, and registers the new post in
  `blog.html`'s grid, `search-index.json`, and `sitemap.xml`. It does
  **not** write the article body — there's no LLM-in-production or CI/build
  pipeline in this project, so the generated file has clearly marked TODO
  placeholders (opening paragraph, "what changed," "why it matters," and
  alt text for each screenshot) that a human or an AI session fills in by
  hand afterward, same as `we-redesigned-our-website.html` was written.
  Requires a local static server (`npm run` has no dev-server script; use
  `node scripts/static-server.cjs <port>`, already wired up as the
  `lts-website-v25` entry in `.claude/launch.json`) and Playwright's
  Chromium (`npx playwright install chromium`, one-time).
- **If a blog post embeds a screenshot of a page that changes again later**
  (e.g. a future redesign tweak), re-run the capture for just that image —
  don't leave a stale screenshot showing removed/old UI. This already
  happened once: `we-redesigned-our-website.html`'s homepage screenshot
  had to be re-shot after the hero network-diagram graphic it displayed
  was removed from `index.html` in a later pass of this same release.

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
- **English-only** (as of v25 — the site carried 16 languages via a
  client-side swap through v24; that system, `js/i18n.js` and the
  `i18n/` dictionaries, was removed entirely in the v25 redesign).
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
