# `project-scaffold-generator` — System Requirements

## 1. Overview & Goal

The most Little-Technical-Solutions-specific automation from the review:
turn a completed full-brief lead (package, selected features, business
brief — everything `website-designer.js` already collects) into an actual
starter project folder, ready for Dylan to start building in, instead of
manually re-reading the brief and setting up a new `vN`-style project
from scratch every time. This is a genuine competitive moat because it's
built on your own existing build conventions (feature manifest → catalog
JSON → page scaffolding), not a generic tool a competitor could just buy.

Business goal: cut real hours off the setup phase of every job taken,
which either increases margin or capacity for more jobs — directly
serves "sell more websites" by making each one cheaper/faster to deliver.

## 2. Actors

- **Dylan (admin)** — triggers scaffold generation from the lead detail
  view in `admin.html` once a full-brief lead is ready to start; receives
  the generated output.

## 3. Functional Requirements

1. Given a `full`-stage lead record (package, `optionalSelected`,
   `premiumSelected`, `brief.*` fields, `businessName`), generate:
   - A checklist (Markdown) of every included + selected feature, derived
     from the same catalog data `website-designer.js` uses
     (`starter-catalog.json`/`business-catalog.json`), so the checklist
     can never drift from what the customer actually saw/chose.
   - Placeholder page content pre-filled from the brief where a direct
     mapping exists (business name in the header/footer, service list
     turned into a first-pass Services page outline, address/hours into
     the footer/contact page, brand colors as CSS custom-property
     suggestions).
   - A single "Brief" document consolidating everything the customer
     entered, formatted for a human to read top-to-bottom (this
     effectively supersedes needing to re-open the PDF/email every time
     to remember what was asked for).
2. Output packaged as a downloadable zip (or, if run locally rather than
   as a hosted function — see §10 — written directly to a new folder on
   disk) containing the checklist, brief doc, and any pre-filled content
   fragments.
3. This is explicitly a **scaffold**, not a working site — it does not
   attempt to programmatically produce a deployable `vN` folder copy of
   the whole live site; it produces the planning/content artifacts that
   currently take manual re-reading of the brief to assemble.

## 4. API Contract

`POST /.netlify/functions/project-scaffold-generator` (admin/staff only)
```json
{ "leadId": "WD-..." }
```
→ `200`, `Content-Type: application/zip`, streamed zip body containing:
```
CHECKLIST.md
BRIEF.md
content-fragments/
  services-outline.md
  contact-info.md
  brand.css        (CSS custom properties from brief.brandColors, best-effort)
  images/
    logo.<ext>           (present if the lead has a logo attachment)
    photo-1.<ext> ...     (present if the lead has photo attachments)
```
`404` if lead not found; `400` if lead is stage `"quick"` (no brief exists
yet to scaffold from — this function only makes sense for `"full"` leads).

## 5. Data Model

No new store — reads an existing `leads` record. No persistence of its
own beyond, optionally, a `scaffoldGeneratedAt` timestamp written back to
the lead record so the admin UI can show "scaffold already generated" and
avoid confusion about whether this step has been done.

## 6. Business Rules & Validation

- Only operates on `stage: "full"` leads (§4).
- Feature checklist must be generated from the **same catalog source
  files** `website-designer.js` already loads
  (`starter-catalog.json`/`business-catalog.json`), not a re-typed copy —
  this is the whole point (never drifts from what the pricing tool
  actually offered).
- Placeholder content generation is explicitly best-effort/draft
  quality — the requirements should not imply this replaces Dylan's own
  judgment in building the actual site, only that it removes the "start
  from a truly blank page" step.

## 7. Integration Points

- Reads `starter-catalog.json`/`business-catalog.json` (already present
  at the site root, loaded client-side by `website-designer.js` — the
  function needs its own server-side read of the same files).
- Reads from the same `leads` store `website-designer.js` writes to.
- Triggered from a new button in `admin.html`'s lead-detail view (which
  itself likely needs to exist first, per the `leads-dashboard` spec —
  these two are natural to build together).

## 8. Error Handling

- Lead not found / wrong stage: clear `400`/`404` rather than a partial
  or empty zip.
- Missing/incomplete brief fields (e.g., a conditional content-brief
  section that was never filled because the triggering feature wasn't
  selected): simply omit that section from the output rather than
  emitting a placeholder — an absent section is more useful signal than
  a misleading blank template.

## 9. Security & Privacy Considerations

- Admin/staff-only (same role check pattern as `content.js`) — this
  bundles a customer's full business brief, which is meaningfully
  sensitive (contact info, business details, possibly uploaded
  logo/photos) and must never be publicly reachable.
- If logo/photo attachments exist on the lead (`hasLogo`/`photoCount`
  fields already recorded by `website-designer.js`), decide whether to
  include the actual image data in the zip (convenient) vs. just noting
  their presence and pointing to the original email (simpler, avoids
  duplicating binary data across systems) — see open question.

## 10. Non-Functional Requirements

- Zip generation for a handful of small text files is trivial in terms
  of performance/timeout risk — no special handling needed.
- Image attachments **are** included (§11), so watch Netlify Functions'
  response size limits — should be fine for a few photos under the
  existing 4MB-per-photo cap already enforced by `website-designer.js`,
  but worth a sanity check once built (a logo + up to 4 photos at 4MB
  each is a meaningfully larger response than the text-only version —
  confirm this stays comfortably under Netlify's function response size
  ceiling before shipping).

## 11. Decisions (resolved 2026-07-14)

- **Include the actual logo/photo files** in the zip (under
  `content-fragments/images/`), not just a reference to them — everything
  for the project lands in one place. Update §4's zip contents to add
  this directory and §9 to note the added sensitivity of bundling
  customer-uploaded images alongside the brief text.
- **Zip file confirmed as the output shape** for v1 — no project-tracking
  tool integration to build against yet.
