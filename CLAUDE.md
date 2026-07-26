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
- **Headcount stays private (as of v26, refined in v27):** the owner
  explicitly asked for employee count to be kept private. Customer-facing
  copy should not state or imply the business is a solo/one-person
  operation ("team of one," "the same person who answers the phone,"
  "one technician," etc.). This is about not *confirming* headcount
  either way, not about fabricating claims of a larger staff.
  **v27 adds the other half of that rule:** copy must not imply a larger
  staff either. An outside review read "Our Team" / "The people behind the
  work" (plural, one person pictured) as deliberate concealment, which is
  worse than either honest answer. The safe register is second-person and
  singular-agnostic — "you'll know who's coming," "owner-led," "your point
  of contact" — never "the people behind the work" or "our team of." As of
  v27 `team.html` is titled "Who you'll work with" and leads with
  "You'll know who's coming."
  Note that headcount still leaks in places the scrub missed: `terms.html`
  §12 references "its owner, and any subcontractors" (kept — it's standard
  and no longer contradicts anything), and `portfolio.html` says
  "brand-new business" (kept — that's business *age*, which the owner has
  not asked to keep private, and CLAUDE.md forbids exaggerating it).
  The v2.1.0 patch note that stated "one owner and no plans to add staff"
  outright was reworded in v27.
- **Founder-bio content lives on `about-the-owner.html` (as of v26):** the
  full Navy-service narrative, ship photos, education detail, and Dylan's
  personal letter were consolidated onto this one dedicated page — this
  resolves what used to be audit finding F036 (the same facts hand-typed
  independently across `about.html`, `index.html`, `team.html`, and
  `testimonials.html`). `about.html` is now company/services-focused, not
  founder-focused. The other pages keep only brief, non-duplicated
  mentions (e.g. "Veteran-owned" trust badges) linking to
  `about-the-owner.html` for the full story — if any of these facts ever
  change again, `about-the-owner.html` is the one place to edit; the brief
  mentions elsewhere shouldn't need touching unless their own wording
  changes. `about-the-owner.html` has no persistent nav slot (main or
  footer) — same pattern as `portfolio.html` — it's reached via contextual
  links plus `sitemap.xml`/`sitemap.html`/`search-index.json`.

## Versioning convention

- Each site revision lives in its own folder under `Business Website/
  Website Code/vN` (currently `v27`), copied forward from the previous
  version — never edited in place. Each version folder is its own git
  repo pointed at the same GitHub remote
  (`LitTechSolutions/lit-solutions-website`), so pushing from the current
  version's folder is what actually deploys.
- The version follows semver: **major** = large redesign/rework,
  **minor** = feature addition, **patch** = bug/security fix only.
  Current: `4.4.0`. It is tracked internally and in `patch-notes.html`;
  it is no longer displayed to customers (see next bullet).
- **The version string is no longer shown to customers (v27).** The
  footer "Website Version 4.x.x" line and its `<span id="siteVersion">`
  fallback were removed from every public page: an outside review read a
  public version number plus a public changelog as advertising
  instability (13 releases and 3 redesigns) to people evaluating us to
  *build* their site. `js/site-version.js`'s `SITE_VERSION` constant is
  still the single source of truth and still the only place to edit on a
  release — it just has no on-page target now, and no-ops harmlessly.
  Header/footer changes still need a scripted sweep across all public
  HTML files; there's still no build step or include mechanism.

## Customer-facing trust commitments (v27)

These are promises now published on the live site. They are business
commitments, not copy — don't soften, reword, or quietly drop them
without the owner explicitly deciding to, and keep every page that
states them in sync:

- **50/50 payment on fixed-price website work** (`terms.html` §3), stated
  on `pricing.html`, `faq.html`, `payment.html`, `website-designer.html`.
- **30-day workmanship warranty** (`terms.html` §6A), stated on
  `pricing.html`, `faq.html`, `payment.html`.
- **30-day window** to raise a problem, up from 7 (`terms.html` §4).
- **Free diagnostic with no carve-out** — `terms.html` §6 previously said
  diagnostic time was billable while `pricing.html` said "Free". Billable
  time now starts only after a quote is approved.
- **No trip charge inside the on-site service area** (`pricing.html`,
  `faq.html`).
- **Domain/files/source released within 10 business days, free**
  (`terms.html` §9, `faq.html`).
- **No SSN-bearing documents by email** for the Heroes Discount, deleted
  within 7 days of verification (`terms.html` §10, `heroes-pricing.html`,
  `privacy.html` §1 and §5).
- **Not insured, and we say so** — `faq.html` states this plainly. The
  moment a policy binds, that answer changes and a "licensed & insured"
  signal can go on the homepage/About/service pages. Until then, no page
  may imply coverage that doesn't exist.

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
