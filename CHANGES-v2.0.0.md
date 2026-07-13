# v2.0.0 — About Us Rebuild — What Changed

You asked for the About Us page to be rebuilt using the content in the
`About Us` folder — a set of text recommendations from a ChatGPT voice
interview (`About Us.docx`) plus eight photos of you. You also set the
versioning policy going forward: **major.minor.patch**, starting at
2.0.0 for this release. This is the first release under that policy,
and it earns the major bump — real photography and a full content
rebuild of a core page, not an incremental feature.

## New: a fuller About Us page

Kept what was already working (the "why us" cards, the veteran
credentials, the Navy service stats) and added what was missing:

- **Mission & values** — a short mission statement plus a row of the
  core values from the interview (integrity, honesty, professionalism,
  transparency, continuous learning, craftsmanship, community
  involvement).
- **Three more "why us" cards** — local/personal service, built around
  the client instead of a rigid template, and ongoing support after
  launch — the points from the interview's "what makes us different"
  list that the existing four cards didn't already cover.
- **Expanded founder story** — the existing veteran section only
  covered the Navy service. Added the part that was missing: the
  systems-engineer career and Cybersecurity Technology degree earned
  afterward, and why that led to founding the business.
- **How a website gets built** — a new four-step process section
  (package → Website Designer tool → build & review → launch), reusing
  the same numbered-step component already on the homepage.
- **Support after launch & what's next** — post-launch support terms
  and the Website Care Plan, plus a mention that the Website Designer
  tool is the first piece of the "proprietary software" the interview
  described — Care Plan subscribers get future tools like it at no
  extra cost.
- **A message from Dylan** — a personal closing note before the
  existing "brand-new business" and contact CTA sections.

## Photos: 4 of the 8 selected, not all of them

You said to use judgment rather than post everything. Selected:

- A console/watch-standing photo (blue-lit combat information center
  aboard USS Antietam) as the lead image for the founder story — the
  most striking and the clearest visual tie between "technical focus at
  sea" and "technical focus on your website."
- An underway action shot (life vest, USS Antietam ballcap, handling
  line on deck) and a qualification-pinning ceremony photo, paired
  together as a smaller "moments" spread.
- A black-and-white portrait for the closing "message from Dylan" note.

Left out: two photos where you're masked (COVID-era), a group/division
photo that isn't really about you individually, and a ceremony shot
where faces are too small to read well on a page. All four selected
photos live in the new `assets/about/` folder, resized/compressed where
needed (the largest source photo was 1511×2015 at 372KB; brought down to
750×1000 at ~200KB).

## One correction against the source material

The interview doc says Starter/Business websites include "one/two
complimentary redesigns" after launch. The site's own published pricing
(`pricing.html`) already states something more specific and slightly
different: 1 or 2 *revision rounds before launch*, plus 30 or 60 days of
*post-launch support*. Rather than publish a new, uncorroborated claim
that could conflict with what's already live, the About page's "Support
after launch" section states only the terms already published on
`pricing.html`, plus the Website Care Plan for ongoing help after that.
Worth a look if you did mean an actual post-launch redesign benefit
distinct from what's on the pricing page — that would need to be added
to `pricing.html` first so the two pages agree.

## Versioning policy, starting now

Per your instruction: version numbers are now **major.minor.patch**.

- **Major** (first number) — a massive upgrade or feature (this
  release: full About page rebuild + real photography, the first of its
  kind on the site).
- **Minor** (second number) — a feature addition that doesn't rise to
  "major."
- **Patch** (third number) — bug fixes.

Every page's footer now reads "Website Version 2.0.0" (updated across
all 33 HTML pages), and `patch-notes.html` has a new v2.0.0 entry at the
top explaining the new numbering scheme to visitors, with v1.19 demoted
to a regular (non-"Current") entry beneath it.

## Verification performed

- Viewed all 8 source photos directly before choosing; confirmed the
  4 selected are genuinely of you (visible name tape reads "DYLAN
  LITTLE" in two of them) and load correctly at their intended
  dimensions on the live page.
- Cross-checked every factual claim pulled from `About Us.docx` (Navy
  role/ship, degree, Website Care Plan contents, 30/60-day support
  windows) against what's already published elsewhere on the site
  (`pricing.html`, `payment.html`) before publishing it a second place,
  catching the redesigns-vs-revision-rounds discrepancy above.
  Note: military ranks/timelines/hours were taken as given from the
  interview transcript and the existing About page content -- not
  independently re-verified against service records.
- Confirmed layout via computed styles (grid columns, image
  object-fit/border-radius) since on-page visual scrolling was
  unreliable in this session's browser tooling — same limitation noted
  in prior release notes, not a defect in the shipped code.
- HTML tag-balance check across `about.html` and `patch-notes.html`:
  clean. CSS brace balance: clean.
- Confirmed `grep` finds zero remaining "Website Version 1.19" strings
  and 33 pages now read "Website Version 2.0.0."
