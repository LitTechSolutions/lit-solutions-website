# v2.2.0 — Website Designer Content Brief — What Changed

You asked me to review a real submission from the Website Designer tool
(`WD-MRJ4YZ96-6A0784`, "Test Business") and judge whether it was enough
information to actually start building a website. It wasn't: the tool
only ever captured package, feature checkboxes, and price — no business
description, no page content, no logo/photos, no domain decision. This
release closes that gap so a completed submission is something you can
build from immediately, not just a scoped quote.

## New: a business brief, always required

Step 3 ("Your details") now asks, for every submission regardless of
package or features chosen:

- What the business does and who its customers are, industry, and
  service area (all required — these are the fields that make "please
  make this website for me" buildable)
- A list of services/products (required)
- Brand colors and style references, a logo upload, and up to 4 real
  photos (all optional, but now actually collected instead of assumed)
- Physical address/hours, social links, and a preferred launch date
- A "desired domain name" field that only shows up if you don't already
  have one, so "not yet" no longer leaves that decision unresolved

## New: content questions that follow the checkboxes

Checking a feature in Step 2 now reveals the matching content question
back in Step 3 — team/staff bios, testimonials to feature, FAQ
questions, blog topics, prices to display, booking details (services,
hours, how to confirm), your newsletter platform, and SMS notification
specifics (with a note that recipients must opt in). For the Business
package, the content pages that come standard (staff, testimonials,
FAQ, blog, gallery, newsletter) always show their brief section, since
those get built either way — Starter only shows them when the matching
optional box is checked. This mapping lives in
`CONTENT_BRIEF_TRIGGER_TITLES` / `CONTENT_BRIEF_ALWAYS_INCLUDED` at the
top of `js/website-designer.js`.

## Both the email and the PDF carry the brief now

`netlify/functions/website-designer.js` validates the four required
fields server-side, adds a "Business brief" section and (when present)
a "Content details" section to the email body, and attaches the logo
and photos alongside the existing PDF — capped at 4MB per image, 4
photos, ~15MB combined, with a clear error rather than a silent drop if
someone goes over. The client-generated PDF summary gets the same
brief content via `buildPdf()`, so the two records agree. The lead
record saved to Netlify Blobs stores the brief text and an
attachment count/flag, not raw image bytes.

## What I deliberately did not build

- **No signature field.** The paper reference forms have one, but the
  live tool already has a required consent checkbox (`wdConsent`) —
  that's this codebase's existing equivalent, and adding a redundant
  signature capture would be over-scoped for what this fix needed.
- **No payment/deposit gate.** Real payment collection is a separate,
  larger piece of work and out of scope here — flagging it as a
  follow-up rather than building it in.
- **No i18n keys on the new fields.** See the reconciliation note
  below — this was deliberate, not an oversight.

## Important: this is v16, forked from v15, not merged into it

Per the versioning convention, revisions get a new `vN+1` folder. But
`v15` had uncommitted, in-progress edits from concurrent work (the
language/i18n project — 6 tasks, adding the language selector and
per-page translations) at the moment this work started, with no git
history to merge against safely. Editing `v15` in place risked
colliding with that work, so I copied `v15` → `v16` and made every
change described above only inside `v16`.

**Practical effect:** `v16` reflects `v15` as of the copy — including
whatever language-selector work had already landed by then — but will
**not** include any language work finished in `v15` after that point.
None of the new business-brief fields carry `data-i18n` attributes, so
they'll render in English regardless of the selected language until
someone runs them through whatever process is populating
`i18n/*.json` — deliberately avoided touching those files here to stay
out of the language work's way.

**Before this ships**, someone needs to reconcile `v16` against
wherever the language work landed (`v15` or a later folder) — likely by
re-applying this release's diff on top of the finished language work,
rather than shipping `v16` as-is and losing translation progress.

## Operational items — these need your action, not more code

- `RESEND_API_KEY` / `EMAIL_FROM` must be set for the email to actually
  send (unchanged from prior releases) — the submission is still saved
  to the `leads` Blobs store either way.
- Decide whether 4MB/4-photo caps are the right limits for your email
  provider's attachment ceiling before this goes live with real
  customer photos.
- The reconciliation with the language-work folder described above.

## Verification performed

- `node --check` on both `js/website-designer.js` and
  `netlify/functions/website-designer.js` — clean.
- HTML tag-balance check on `website-designer.html` and
  `patch-notes.html` — clean. Every new `<label for>` matches an
  existing input id, no duplicate ids.
- Cross-referenced every new field id between the HTML and the JS
  (`collectBrief()`, `collectImageAttachments()`, and the
  `wdBriefGroup_*` visibility toggling) — all wired, none orphaned.
- Confirmed the conditional-visibility map against the actual
  `starter-catalog.json`/`business-catalog.json` contents (not just the
  reference PDFs) — this is what caught that several content pages
  (staff, testimonials, FAQ, blog, gallery, newsletter) are standard
  inclusions on Business but optional checkboxes on Starter, which the
  visibility logic has to branch on by package.
- Traced every new field from HTML through to the `brief`/`logo`/
  `photos` validation in the Netlify function and into both the email
  HTML and the persisted Blobs record.

**Not verified: an actual click-through in a browser.** I tried to spin
up a static preview of `v16` to click through the flow, and separately
tried loading the page directly as a `file://` URL — both attempts
failed in this session with what looks like an environment-level
sandbox issue (a pre-existing, unrelated launch config that has
nothing to do with this change failed the exact same way when I
tested it as a control). So this has NOT been visually exercised in a
browser — someone should click through Step 3 for both packages before
this ships, confirming the conditional sections actually show/hide as
expected and the required fields block submission correctly.
