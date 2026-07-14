# v3.1.0 — A Real Quick Quote, Before the Long Form — What Changed

You pointed out a real gap between what the site advertises ("get a quick
quote") and what actually happened: before a customer could submit
anything from the Website Designer, they had to fill out the full
project-details form — business description, industry, service area,
services list, brand colors, logo, photos, and more. Here's the fix.

## The new flow

**Before:** Package → Features → one long form (contact info + full
content brief, ~15 fields, several required) → submit → done.

**Now:** Package → Features → a clear price + a short quote form (name,
email, phone, preferred contact method — 4 fields) → submit → **you're
notified immediately** → the customer is asked "want to finish your
project details now?" → if yes, the same detailed form as before (now
clearly optional, not gating the quote); if no, that's a complete,
respected outcome.

Concretely:

- Step 3 now shows the exact running price in a large, clear callout
  right above a 4-field form (name, email, phone, preferred contact
  method — phone/text/email), plus the existing "starting estimate, not
  final" consent checkbox. Submitting this is what actually sends you a
  notification — a real "quick quote," not a long form in disguise.
- Right after that, the customer sees a prompt: "Want to finish your
  project details now?" with a genuine, low-pressure "Not right now"
  option alongside "Yes, let's continue."
- Choosing "Not right now" ends the flow cleanly — no dead end, no
  hidden requirement, just a confirmation that you'll follow up using
  their preferred contact method.
- Choosing "Yes" reveals the same full project-details form that used to
  gate the quote (business description, industry, service area, services,
  brand colors, logo/photos, address/hours, social links, launch date, and
  the per-feature content questions) — now positioned as what it actually
  is: extra detail that helps you start building sooner, not a requirement
  to get a price.

## What you get on your end

- **Every quick quote sends you an email immediately** — package, price,
  features selected, and the customer's name/email/phone/preferred
  contact method. No PDF at this stage; it's meant to be fast.
  Persisted to Netlify Blobs under `leads` with `stage: "quick"`.
- **If the customer continues to full details, that's a second email** —
  same as the previous single-step submission (full content brief + PDF
  summary attached), but now it explicitly references the earlier quick
  quote's ID so the two are easy to match up in your inbox, and the
  original quick-quote record gets marked `completedFull: true` so the
  two stay linked in storage too.
- If someone only sends the quick quote and never returns, you still have
  a complete lead record with real contact info and their preferred way
  to be reached — nothing is lost just because the long form wasn't
  filled out.

## Translation

The 21 new or reworded strings this required (the new quote-step copy,
the preferred-contact-method field, the continue-or-not prompt, and the
project-details step's new copy) were translated into all 15 non-English
languages, matched against each language's existing tone in the tool.

## Verification performed

- HTML tag-balance check on `website-designer.html`: clean.
- `node --check` on `js/website-designer.js` and
  `netlify/functions/website-designer.js`: clean.
- JSON validity check on all 15 updated `i18n/*.json` files, with exact
  key-set verification (0 missing/extra) for the 21 new/changed keys:
  clean.
- End-to-end flow tested live in the browser against a mocked backend
  (this environment has no live Netlify Functions): package selection →
  features → quick quote submit (verified the request payload contains
  no brief/PDF data) → continue prompt → both the "yes" path (full brief
  submit, verified the `quickLeadId` correlation and PDF attachment) and
  the "no" path (verified no second network request, correct closing
  message) → confirmation screen. Also tested the quick form's
  server-error path (stays on the form, shows the error, re-enables the
  submit button).
- Live-verified the new copy in German, including the price recap, the
  preferred-contact-method dropdown options, and the updated step label.
- Not verified: an actual end-to-end run against the live Netlify
  Functions/email delivery (not available in this environment) — this
  should be smoke-tested on a real submission once deployed, before
  relying on it for real leads.
