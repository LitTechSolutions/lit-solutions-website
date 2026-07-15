# Owner Input Needed

Tracks items discovered during the self-improvement pass (2026-07-15)
that require something only Dylan can provide — approved content,
credentials, an external account, or a policy/legal decision. Nothing
in this file has been published to any public page. Entries are added
as they're found; each is cross-referenced to the commit that made the
surrounding change.

## 1. Armour Wireless Solutions testimonial

- **Status:** Blocked — no approved wording exists in the repo or CMS.
- **What's needed:** The actual testimonial text from Bill (or whoever
  is the appropriate contact at Armour Wireless Solutions), in their
  own words, plus explicit permission to publish it with attribution
  (name/title/company, as they'd like it shown).
- **What's already done:** `testimonials.html`'s placeholder copy no
  longer implies zero customers exist (commit `a5eff6c`) — it now
  correctly says real client work has been completed and reviews will
  be published once approved. The publishing mechanism itself
  (`js/cms.js`'s `mountTestimonials()`) needs no further engineering —
  add the item through the admin panel's Testimonials tab and it goes
  live automatically, swapping out the placeholder.
- **Do not:** draft, paraphrase, or infer testimonial wording on the
  client's behalf under any circumstance.

## 2. Armour Wireless Solutions portfolio case-study detail

- **Status:** Partially addressed with only independently-verifiable
  facts; full case study still blocked.
- **What's already done:** `portfolio.html` now shows a "Featured
  Project" card with the client name, live URL
  (https://armourwireless.com), and "custom website design and
  development" as the service category (commit `43b73a3`) — these are
  the only facts confirmed directly by Dylan in this session.
- **What's needed for a fuller case study:** A real project
  description (scope, specific features built, timeline) from Dylan or
  the client — not derived by browsing the live site — plus any
  client-approved desktop/mobile screenshots, if the client is willing
  to have them published.

## 3. Gallery page content

- **Status:** No approved images in repo/CMS.
- **What's needed:** Any client-approved desktop/mobile photos Dylan
  wants published, with alt text guidance if the default (derived from
  filename/context) isn't sufficient.
