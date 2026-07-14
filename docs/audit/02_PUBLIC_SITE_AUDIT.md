# Session 2 — Public Site Audit

Scope: homepage, shared header/footer/nav, all 33 public pages, CTA
inventory, and content accuracy. No code changes were made in this
session — findings and evidence only, per `00_AUDIT_CONTROL.md`. Read for
this session: `00_AUDIT_CONTROL.md`, `AUDIT_STATE.json`,
`01_REPOSITORY_BASELINE.md`, and the specific page/source files cited
below — no unrelated repository exploration was performed.

## 1. Header / footer / nav

Confirmed via direct diff: the header block is byte-identical across a
6-page sample (`index.html`, `services.html`, `contact.html`,
`pricing.html`, `booking.html`, `faq.html`) and the footer block is
byte-identical across a 6-page sample (same five plus `team.html`) — no
per-page nav/footer drift exists anywhere sampled. This confirms
`01_REPOSITORY_BASELINE.md`'s "byte-identical copy-paste" architecture
note and rules out per-page navigation inconsistency as a finding.

Nav structure (from `index.html:76-113`, confirmed shared): 6 top-level
items (Services*, About, Pricing, Website Designer, Heroes Discount,
Resources*) where the two starred items are dropdowns containing 6 and 8
links respectively — **20 total nav destinations** reachable from the
header alone, plus the footer repeats nearly all of them individually
(`index.html:380-403`) rather than linking to section anchors. This is
the concrete count behind F029 (nav may have too many equal-priority
choices) — confirmed still accurate, no changes needed to that finding.

`sitemap.html` was checked against the actual file list for staleness:
its curated list (`sitemap.html:149-169`, six grouped sections) correctly
omits `admin.html` (the only `admin.html` reference on the page is the
shared footer's "Staff Sign In" link, not a sitemap entry) and reasonably
treats "Blog" as one entry rather than enumerating individual posts. No
finding — `sitemap.html` is accurate and not stale.

No broken internal links were found: every `href="*.html"` across all 34
pages resolves to a file that exists in the repository. Confirmed
strength, not a finding.

## 2. CTA inventory (expands F017)

Full inventory of every `class="btn*"` anchor/button across all 33 public
pages (`grep -oE '<a [^>]*class="btn[^"]*"[^>]*>[^<]*' *.html`, excluding
`admin.html`). Distinct label text found for what is conceptually the
same "start engaging about a project" action:

| Label | Target | Where |
|---|---|---|
| "Get a quote" | `intake.html` | header, every page (persistent) |
| "Get a free quote" | `contact.html` | `index.html` hero only |
| "Get a Quote" | `intake.html` | 5 service-detail pages' hero |
| "Get a Custom Quote" | `intake.html` | `pricing.html`, `services.html`, `payment.html`, `heroes-pricing.html`, 5 service-detail pages |
| "Fill Out Project Form" | `intake.html` | `index.html`, `about.html`, `contact.html`, `booking.html`, `team.html` |
| "Contact Us" | `contact.html` | `index.html`, `about.html`, `faq.html`, `service-area.html`, `team.html` |
| "Start a Project" | `intake.html` | `portfolio.html`, `testimonials.html` (empty-state CTAs) |

That is **7 distinct phrasings funneling into just 2 real destinations**
(`intake.html` / `contact.html`) for one conceptual action, before even
counting the secondary CTAs ("See Pricing," "See full pricing," "See full
service details & pricing," "Design my Starter/Business site," "Pay for
Starter/Business," "See Heroes Discount," "See what we handle," "Read our
full story" / "Read the full story," "Back to home," "All articles").
This matches and strengthens F017 with a complete evidence table; no
change to F017's severity or status, but it can now cite this table
instead of a general impression.

Each of the 5 service-detail pages (`service-website.html`,
`service-computer.html`, `service-networking.html`,
`service-cybersecurity.html`, `service-business-it.html`) independently
shows **both** "Get a Quote" (hero) and "Get a Custom Quote" (page
bottom) — two near-identical labels, same destination, same page. Minor,
folded into F017 rather than a new ID.

## 3. New finding: F037 — homepage's primary CTA sends "quote" seekers to the wrong form

- **Severity:** High
- **Status:** Open
- **Domain:** Content/IA (Session 2)

`index.html:157` — the homepage hero's most prominent CTA reads "Get a
free quote" (`data-i18n="home.cta_quote"`) and links to `contact.html`.

`contact.html:177` — that page's own copy says: *"A short question? Use
this. For a full project quote, the project form below gets you a
faster, more complete answer,"* explicitly linking to `intake.html` as
the correct destination for quote requests.

The site's single highest-visibility CTA — the hero button on the
homepage — is labeled "quote" but sends visitors to the page the site's
own copy says is *not* where quotes are handled, while the persistent
header CTA right above it (`index.html:130`, "Get a quote") correctly
points to `intake.html`. A visitor who clicks the big hero button gets a
short contact form and no indication anything went differently than
intended; the actual quote/project-scoping form is one click further
than it needs to be. This is a distinct, concrete misdirection bug, not
just phrasing variance — related to but separate from F017.

**Fix (for a future implementation turn, not this session):** either
repoint `index.html:157`'s href to `intake.html` to match its label, or
relabel it to match its actual destination (e.g., "Ask a question" /
"Contact us"), consistent with how `index.html`'s own bottom-of-page CTA
pair already correctly distinguishes "Contact Us" → `contact.html` from
"Fill Out Project Form" → `intake.html` (`index.html:364-365`).

## 4. Content accuracy spot-checks

- **Heroes Discount percentages** (15% one-time / 5% recurring) are
  consistent across `heroes-pricing.html`, `pricing.html`, and
  `faq.html`. No finding.
- **Staffing claims:** `team.html:142-165` is honest and explicit — "One
  person, every job," "currently a team of one," "not handed off to a
  subcontractor." No exaggeration found anywhere searched (`award`,
  `thousands of`, `years in business`, `our team of`, `our staff`,
  `industry-leading` all searched site-wide; no misleading matches).
  Confirmed strength — matches the `CLAUDE.md` instruction not to
  exaggerate staffing/credentials.
- **Blog architecture:** `blog.html` links 3 hand-written static articles
  directly, while `js/cms.js` separately renders CMS-managed posts
  through `blog-post.html?slug=`. This is coherent by design (per
  `js/cms.js:109`'s own comment), not a finding.
- **F008/F009/F010/F018/F024 (all previously recorded, domain Session
  2):** re-checked directly against current source — all still present
  and accurately described:
  - F008: `gallery.html:149-152`, "Nothing posted yet."
  - F009: `booking.html:152`, "Online booking is coming soon."
  - F018: `intake.html:145,159`, instructs "just type 4" / "4 or N/A."
  - F024: `patch-notes.html` — later entries (e.g. v1.11, v1.12) run to
    10+ granular bullet points per release including internal
    implementation detail (color-token behavior, which UI states use
    which colors) more suited to a commit log than customer-facing "what's
    new" copy; the current (v3.2.2) entry is comparatively tighter and
    written in plainer language, but the overall page is inconsistent in
    depth/tone across versions. No change to F024's status.
  - No new evidence changes any of these findings' severity or status.

## 5. Findings ledger addition

| ID | Severity | Status | Domain (session) | Finding | Evidence |
|----|----------|--------|-------------------|---------|----------|
| F037 | High | Open | Content/IA (2) | Homepage hero's "Get a free quote" CTA links to `contact.html`, contradicting that page's own copy directing quote-seekers to `intake.html` | `index.html:157`; `contact.html:177` |

## 6. Not yet verified (flagged for a later session)

- Live-browser/visual verification of nav dropdown and CTA behavior
  (this session was a static-code read, matching Session 1's approach)
  — Session 6.
- Whether `search.html` actually returns correct results for real site
  content — functional/quality territory, Session 6.
