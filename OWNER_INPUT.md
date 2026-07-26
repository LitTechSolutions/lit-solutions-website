# Owner Input Needed

Tracks items discovered during the self-improvement pass (2026-07-15)
that require something only Dylan can provide — approved content,
credentials, an external account, or a policy/legal decision. Nothing
in this file has been published to any public page. Entries are added
as they're found; each is cross-referenced to the commit that made the
surrounding change.

## 1. Armour Wireless Solutions testimonial — RESOLVED

- **Status:** Resolved (commit `0440f3a`).
- **What happened:** Dylan provided the signed customer-review-and-
  approval PDF (copied outside Mail's sandboxed container so it could
  be read). William E. Armour Jr. ("Bill Armour"), President/Owner of
  Armour Wireless Solutions, LLC, checked "I approve the review exactly
  as written," signed and dated it 7/13/2026, and separately checked
  consent for publication on the testimonials page and portfolio page
  with the attribution "Bill Armour, President / Owner, Armour Wireless
  Solutions, LLC."
- **What's already done:** Published the review verbatim (no
  paraphrasing) to `testimonials.html`, updated the hero copy to match
  the site's existing "has real content" wording, translated into all
  15 languages, and verified live rendering matches the approved
  document exactly.
- **Homepage extension (2026-07-19):** the original signed consent form
  scoped publication to "the testimonials page and portfolio page" only
  and didn't mention the homepage. Dylan confirmed directly with Bill
  Armour that homepage placement is also fine (verbal confirmation via
  Dylan, not a new signed document) before the same verbatim quote/
  attribution was added to `index.html`'s hero section.
- **De-duplicated (2026-07-19):** Dylan also added this same testimonial
  through the admin panel (the CMS-managed path `js/cms.js`'s
  `mountTestimonials()` reads from), which meant `testimonials.html`
  briefly showed it twice -- once hardcoded in static HTML, once rendered
  from admin content. Removed the static copy; the admin-entered one
  (already covering the identical approved wording/attribution) is now
  the sole source for that page. The homepage hero placement (`index.html`)
  is unaffected -- it's a separate, deliberate placement, not fed by this
  CMS mechanism, so it still needs its own hardcoded copy.

## 2. Armour Wireless Solutions portfolio case-study detail — RESOLVED

- **Status:** Resolved (commit `2a5f0a6`).
- **What happened:** Dylan provided a project-spotlight document (his
  own case-study writeup, explicitly marked as "not presented as a
  quotation or personal endorsement from the client") with real detail:
  industry, project type, expanded scope, a project description
  paragraph, and 6 specific delivered items. This was real, approved,
  owner-authored content — not scraped from the live site — so it was
  incorporated directly into `portfolio.html`'s Featured Project
  section, translated into all 15 languages, and verified.
- **Still open:** any client-approved desktop/mobile screenshots, if
  Dylan or the client want to add them later (optional, not blocking).

## 3. Gallery page content, and any other admin-inserted CMS content

- **Status:** Cannot verify from this environment.
- **What happened:** Dylan said photos and statements about Armour
  Wireless have already been uploaded through the admin panel. This
  local, static-file coding environment has no credentials for the live
  Netlify Blobs storage the CMS writes to, so none of that could be
  read or verified here.
- **What this means in practice:** No action is needed for this to
  work — `js/cms.js`'s `mountPortfolio()`/`mountTestimonials()`/
  `mountGallery()` already auto-detect real CMS items and replace the
  placeholders automatically, on the live site, the moment those items
  exist. This was true before this session and required no code change.
- **What's needed:** Just confirmation from Dylan that the admin-added
  content is showing up correctly on the deployed site. If something
  looks wrong there, that's a live-data/rendering question that needs
  checking on the actual deployment, not something fixable by editing
  static files in this repo.

## 4. Outside-customer audit remediation (v27 / v4.4.0) — ITEMS ONLY DYLAN CAN CLOSE

A skeptical-customer review of the live site was run twice (before and
after the v4.3.0 revision). Most findings were fixed in code in v27. The
items below are published on the live site but depend on something only
Dylan can confirm or do. **Read this before deploying v27.**

### 4a. Business commitments now published — confirm you accept them

These are live promises. If any is wrong, fix it *before* deploy:

- **50/50 payment** on fixed-price website work, replacing 100% upfront.
- **30-day workmanship warranty** on our labor (`terms.html` §6A).
- **30 days** (was 7) to report that work wasn't done as agreed.
- **No trip charge** anywhere inside the on-site service area.
- **Domain / files / source code released within 10 business days, free**,
  regardless of how the relationship ended, with no offboarding fee.
- **Heroes Discount eligibility documents deleted within 7 days** of
  verification. This one requires an actual habit, not just copy — if a
  DD-214 is sitting in the inbox 30 days later, the Privacy Policy is
  now factually wrong.

### 4b. Business hours — VERIFY

The site now publishes **Mon–Fri, 8:00am–7:00pm ET** in the footer of
every page, in `faq.html`, in `booking.html`, and in the `LocalBusiness`
structured data on 29 pages. This was **derived** from booking.html's own
time windows (Morning 8am–12pm / Afternoon 12–5pm / Evening 5–7pm), not
supplied by Dylan. If the real hours differ — including weekends — say so
and they need changing in all four places.

### 4c. Insurance — currently answered "no" in public

`faq.html` now says plainly that we are **not yet insured**, that coverage
is in progress, and that liability is capped at what the customer paid.
This was the single most damaging gap in the audit for on-site work.
Two actions:
1. Get general liability coverage. It is the highest-value offline item
   on this list by a distance.
2. The day it binds, update the FAQ answer and add a "licensed & insured"
   signal to the homepage, About, and service pages.

### 4d. Nextdoor page name — CANNOT BE FIXED FROM THIS REPO

Our Nextdoor URL is
`nextdoor.com/page/little-technical-solutuons-llc/` — **"solutuons"**,
misspelled. It resolves, so the Nextdoor page itself was created with the
typo in its name. It appears in the footer of every page and in the
`sameAs` structured data sitewide. Dylan needs to rename the page in
Nextdoor's own settings; once the new URL is known, update the footer
link and the `sameAs` array in all 29 pages' JSON-LD.

### 4e. Facebook link — VERIFY

`facebook.com/profile.php?id=61591618750945` returned HTTP 400 to a
logged-out fetch during the audit. Facebook frequently blocks non-browser
requests, so this may be a false alarm — but please open it in a private
window and confirm a logged-out visitor can actually see the page.

### 4f. Kahai Fuqua review — no direct link

Dylan confirmed this is a real review but no direct review URL was
supplied, so the "Google review" attribution on `index.html` and
`testimonials.html` links to the Google Business profile rather than to
the review itself. A deep link to the individual review would be
stronger; add it if Google exposes one.

The third homepage testimonial ("John Matrix") was **removed** at Dylan's
direction — it read as a placeholder to an outside reader (it is the
protagonist of the film *Commando*), and the Testimonials page
simultaneously said we had no reviews yet.

### 4g. Testimonials page is now static, not empty

`testimonials.html` previously rendered a "More reviews are on the way"
empty state while the homepage showed three five-star reviews — the most
damaging single contradiction in the audit. It now ships the Bill Armour
and Kahai Fuqua reviews as static cards. `js/cms.js`'s
`mountTestimonials()` still replaces that grid wholesale when
admin-entered items exist, so there's no double-render risk — but note
that if the CMS holds only Bill Armour's, adding it via admin will drop
Kahai's from that page. Add both in admin, or leave the static pair.
