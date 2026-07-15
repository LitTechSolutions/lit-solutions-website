# Owner Input Needed

Tracks items discovered during the self-improvement pass (2026-07-15)
that require something only Dylan can provide — approved content,
credentials, an external account, or a policy/legal decision. Nothing
in this file has been published to any public page. Entries are added
as they're found; each is cross-referenced to the commit that made the
surrounding change.

## 1. Armour Wireless Solutions testimonial

- **Status:** Blocked — could not read the supplied source file.
- **What happened:** Dylan referenced an attachment,
  `Bill_Armour_Review_Approval_Fillable_Updated.pdf`, located in
  Apple Mail's sandboxed download folder
  (`~/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/...`).
  Reading it failed with `EPERM: operation not permitted` — the coding
  environment cannot access another app's sandboxed container.
- **What's needed:** Either move/copy that PDF into this project folder
  (or anywhere outside Mail's container) and say so, or paste the
  testimonial text and approved attribution directly into the chat.
- **What's already done:** `testimonials.html`'s placeholder copy no
  longer implies zero customers exist (commit `a5eff6c`) — it now
  correctly says real client work has been completed and reviews will
  be published once approved. The publishing mechanism itself
  (`js/cms.js`'s `mountTestimonials()`) needs no further engineering —
  add the item through the admin panel's Testimonials tab and it goes
  live automatically, swapping out the placeholder.
- **Do not:** draft, paraphrase, or infer testimonial wording on the
  client's behalf under any circumstance.

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
