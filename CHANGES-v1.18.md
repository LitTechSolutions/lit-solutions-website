# v1.18 — Full Requirements Audit + Gallery Page — What Changed

You asked whether every function in the master requirements catalog
(`feature_manifest.json`, REQ-1 through REQ-106) had actually been
implemented — not just the accounts-module ones I'd audited before, and
including anything "legacy." This release is the result of that full pass.

## New: Gallery page (REQ-96, Mandatory)
The audit found one real gap: REQ-96 "Image gallery" is a distinct
Mandatory requirement, separate from REQ-18 "Portfolio." Earlier work had
treated `portfolio.html` as covering both, but the reference spec builds
them as two different pages (portfolio = project write-ups with a
title/description; gallery = a plain photo grid) — so Gallery had never
actually been built.

- New page: `gallery.html`, same honest-placeholder pattern as Portfolio
  and Testimonials — nothing shows until a photo is added
- New admin tab: **Gallery** in `admin.html`, with photo (required), alt
  text (required), and an optional caption
- Wired into `content.js` (new `gallery-images` slug), `cms.js` (new
  `mountGallery()`), and added to every page's nav/footer, `sitemap.html`,
  `sitemap.xml`, and `search-index.json`

## Fixed: a real bug found while building this
The shared admin list-editor (used by Blog Posts, Portfolio, Testimonials,
and now Gallery) had `required` validation silently skip photo fields —
the check returned before it ever ran. It didn't matter before, since no
existing photo field was marked required; Gallery's is (a gallery item
without a photo isn't a gallery item), so this got caught and fixed.
Verified in-browser: submitting an empty Gallery form now correctly
reports "Please fill in: Photo, Alt text" instead of silently accepting it.

## Verification performed: the full REQ-1..106 catalog, not a sample
- Read every reference file in `Claude/Business Package Software/`,
  including ones not read in earlier passes: `README_FOR_CLAUDE.md`,
  `POST_BUILD_CHECKLIST_TEMPLATE.md`, `requirements_map.py`,
  `pages_content.py`, `validate_build.py`, `content_schema.json` — these
  clarified that this package is a *generator* for building other LTS
  clients' sites from an intake form, and that REQ priority (M/C/S) governs
  what a generated site includes by default. Since this site was hand-built
  to the same spec rather than generated, the check was: does every
  Mandatory requirement have a real, working implementation, and does every
  Conditional item Dylan actually asked for behave as specified.
- Checked every Mandatory (M) requirement against the live file tree:
  pages exist (`REQ-11` through `REQ-21`, `REQ-34`, `REQ-43`, `REQ-96`),
  nav/footer/breadcrumb/anchor-nav present (`REQ-29..33`), forms have real
  client + server validation (`REQ-41`, `REQ-42`), spam protection present
  on every Netlify form (`REQ-80`: honeypot field confirmed on `contact.html`,
  `intake.html`, `blog.html`'s newsletter form), security headers present
  in `netlify.toml` (`REQ-79`), SEO/schema/sitemap/robots present on every
  page (`REQ-66..69`), accessibility landmarks/skip-links present (`REQ-73,
  74`), newsletter signup present (`REQ-54`)
- Confirmed the accounts-module Conditional requirements built in v1.15
  through v1.17 are all still working: 111/111 mock-suite checks passing
  (up from 108 — added checks for the new `gallery-images` content flow)
- Confirmed real HTTP flow for Gallery: staff sign-in, content POST to
  `gallery-images`, public GET reflects it; browser-verified the
  placeholder correctly disappears and the photo grid renders with alt
  text and caption once content exists
- Re-ran the link-integrity checker across all 33 HTML pages (up from 32):
  0 real broken links
- All function files pass `node --check`

## What's confirmed out of scope (not gaps)
- **REQ-86 Social/OAuth sign-in** — Conditional, needs real provider
  credentials (Google/Facebook app registration) that only you can obtain;
  flagged in the reference spec itself as needing separate follow-up
- **REQ-4, 58, 65, 87, 91, 95, 98, 100-106** — all Premium (S-tier) per the
  spec: 2FA, SMS notifications, advanced privacy/rights management,
  account lifecycle automation, personalized recommendations, a
  permissioned media library, a full headless-CMS-style admin suite,
  payment processing/shopping cart/subscriptions/invoicing as generic
  e-commerce features, and a support ticket system / knowledge base.
  Several of these overlap with things already custom-built for this
  specific business (Square payments, the documents/invoices record
  locker, the messaging system) — those were built because you asked for
  them directly, not as generic S-tier features, so they're not "missing,"
  they're bespoke.

## Operational items — these need your action, not more code
Per `POST_BUILD_CHECKLIST_TEMPLATE.md`, a few Mandatory requirements are
fulfilled by dashboard configuration, not code, and I can't do them for
you:
- **REQ-70 Analytics** — the site is written for Netlify Analytics
  (cookie-free, already reflected in the privacy copy and cookie banner)
  but it has to be turned on in the Netlify dashboard (Site settings >
  Analytics) — it's a paid add-on, so confirm you want it before enabling
- **REQ-48/49 Forms notifications** — set up Forms > Notifications in the
  Netlify dashboard so contact-form submissions actually email you and
  auto-reply to the visitor
- **REQ-9/10 DNS**, **REQ-71 Search Console**, **REQ-77 assistive-tech
  testing pass** — all one-time deployment/launch steps, unchanged from
  before
