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
