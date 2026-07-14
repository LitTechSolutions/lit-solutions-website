# `website-audit` — System Requirements

## 1. Overview & Goal

A free, instant website audit tool: a visitor enters a URL (typically their
own outdated/DIY site), the system fetches and analyzes it, and returns a
scored report ("here's what's costing you customers") with 2-3 lines
steering toward a Little Technical Solutions rebuild. This is the single
highest-leverage item from the business review — unlike every other
recommendation, it pulls in visitors who were not already shopping for a
web designer, by offering free expertise up front.

Business goal: top-of-funnel lead generation. Every completed audit that
captures an email is a warm lead who has just been shown, in specifics,
why their current site is hurting them.

## 2. Actors

- **Anonymous visitor** — arrives via a dedicated landing page (e.g.
  `free-website-audit.html`), submits a URL, optionally an email to receive
  the full report.
- **Dylan (admin)** — receives a notification for every audit that
  captures an email, so leads can be followed up manually in addition to
  automated follow-up (see `lead-followup`).

## 3. Functional Requirements

1. Visitor submits a URL via a form (no login required).
2. System fetches the target page server-side (never from the browser,
   to avoid CORS/CSP issues and to avoid asking visitors to expose their
   own analysis code).
3. System runs a fixed set of automated checks against the fetched HTML
   and response metadata:
   - **Mobile viewport**: presence of `<meta name="viewport">`.
   - **Page weight / response time**: total bytes and time-to-first-byte
     of the initial HTML fetch (full Lighthouse-grade performance testing
     is out of scope for v1 — see §10).
   - **HTTPS**: whether the URL redirects to/uses `https://`.
   - **Basic SEO**: presence and length of `<title>`, meta description,
     a single `<h1>`, and an `og:image`.
   - **Structured data**: presence of any `application/ld+json` block.
   - **Accessibility basics**: presence of `alt` attributes on `<img>`
     tags (percentage covered), presence of a `lang` attribute on `<html>`.
   - **Outdated-tech signals**: presence of table-based layout markers,
     Flash/`<marquee>`/`<blink>` remnants, or a copyright year more than
     3 years stale in visible text (best-effort regex, not authoritative).
   - **Design freshness proxy**: last-modified header / sitemap lastmod if
     present.
4. Each check maps to a pass/warn/fail state and a plain-English
   explanation ("Your site doesn't tell Google what it's about" rather
   than "missing meta description").
5. An overall score (e.g., 0-100, or a simple grade A-F) is computed from
   weighted check results.
6. Result is displayed immediately in-browser (no email required to see a
   summary — this maximizes completion rate).
7. A "email me the full PDF report" capture point is offered after the
   summary is shown (not before — gating the whole result behind an email
   ask measurably increases bounce, per the lead-magnet pattern this is
   modeled on).
8. If an email is provided, the system generates a PDF (reuse the
   `jsPDF` client-side pattern already used by Website Designer, or
   generate server-side — see §9 open question) and:
   - Emails it to the visitor.
   - Notifies Dylan with the target URL, score, and visitor email.
   - Persists the audit + contact as a lead record.

## 4. API Contract

`POST /.netlify/functions/website-audit`

Request:
```json
{
  "targetUrl": "https://example-plumbing-co.com",
  "email": "owner@example.com"   // optional; omit to just view results, no persistence/email
}
```

Response `200`:
```json
{
  "id": "AUD-<id>",
  "targetUrl": "https://example-plumbing-co.com",
  "score": 42,
  "grade": "D",
  "checks": [
    { "key": "mobile_viewport", "status": "fail", "label": "Not mobile-friendly", "detail": "..." },
    { "key": "https", "status": "pass", "label": "Uses HTTPS", "detail": "..." }
  ],
  "emailSent": true
}
```

Response `400`: invalid/unreachable URL (`{"error": "..."}"`).
Response `429`: rate-limited.
Response `502`: target site could not be fetched (timeout, DNS failure,
non-HTML response) — return partial guidance rather than a bare error
("We couldn't load that site directly — try double-checking the URL").

## 5. Data Model

New blob store: **`audits`** — key = audit id (`AUD-<timestamp base36>-<random hex>`,
matching the existing `WD-...` id convention in `website-designer.js`).

```
{
  id, targetUrl, score, grade, checks: [...],
  email: string | null,
  emailSent: boolean,
  createdAt, ip
}
```

If `email` is present, also write/update a **`leads`** record (same store
used by `website-designer.js`) with `source: "website-audit"` so it shows
up alongside quote leads in the `leads-dashboard` function (see that
spec) — this is the integration point that makes the audit tool actually
feed the sales pipeline rather than being an island.

## 6. Business Rules & Validation

- `targetUrl` must parse as a valid absolute URL; reject `javascript:`,
  `file:`, `data:`, and any non-http(s) scheme outright.
- **SSRF protection is mandatory**: this function fetches an arbitrary
  user-supplied URL server-side. Before fetching, resolve the hostname and
  reject requests targeting private/internal IP ranges (RFC1918,
  loopback, link-local, `169.254.169.254` cloud-metadata address) and
  reject redirects that land on such ranges. This is a genuine security
  requirement, not a nice-to-have — do not skip it.
- Fetch with a strict timeout (e.g., 8s) and a max response size (e.g.,
  2MB of HTML) to avoid the function hanging on a slow-loading or
  enormous target page.
- Rate limit by IP: reuse `rateLimited()` from `_lib/auth_utils.js`, e.g.
  5 audits/hour/IP — generous enough for a legitimate visitor to retry a
  typo'd URL, tight enough to block scraping abuse.
- Do not require `email` to see the on-screen summary (see §3.6-3.7).

## 7. Integration Points

- New landing page `free-website-audit.html`, linked prominently from the
  main nav or homepage (this is a top-of-funnel tool — it needs real
  visibility, not just a buried link).
- Reuses `_lib/auth_utils.js` (`json`, `rateLimited`) and `_lib/email.js`
  (`sendEmail`).
- Writes to the same `leads` store as `website-designer.js`, so
  `leads-dashboard` (see that spec) shows audit-sourced leads alongside
  quote-sourced leads with a `source` field distinguishing them.
- A completed audit with a captured email should be eligible for the
  `lead-followup` drip sequence (see that spec) — likely a different,
  audit-specific message track than the "quoted but didn't continue"
  track, since the visitor hasn't seen pricing yet.

## 8. Error Handling

- Unreachable/timeout target: return a graceful partial result (`502`)
  explaining the site couldn't be loaded directly, rather than a bare
  failure — still worth showing whatever generic guidance applies.
- Malformed HTML: parse defensively (the existing codebase's pattern of
  Python `html.parser`-style tolerant parsing translates to using a
  forgiving HTML parser library or hand-rolled regex checks here, since
  this is a Node function, not Python — a lightweight, dependency-free
  regex/string-based check set is preferable to adding a full DOM/JSDOM
  dependency purely for this).

## 9. Security & Privacy Considerations

- SSRF protection (§6) is the primary risk — treat as required, not
  optional, before shipping.
- Do not log or store the fetched HTML content itself, only the derived
  check results — avoids inadvertently retaining a copy of a third
  party's (possibly copyrighted) site content.
- Visitor-submitted email is PII — follows the same handling as other
  lead capture in this codebase (stored in Netlify Blobs, only emailed to
  `dylan@lit-solutions.tech` and the visitor themselves).

## 10. Non-Functional Requirements

- V1 scope deliberately excludes real performance/Lighthouse-grade
  testing (that requires a headless browser, which is a much heavier
  Netlify Function — real Core Web Vitals data would need a service like
  PageSpeed Insights' public API as a v2 enhancement, called server-side
  with the target URL).
- Function should complete in well under Netlify's function timeout
  (~10s on the free/starter tiers) — the 8s fetch timeout (§6) leaves
  headroom for analysis + response.

## 11. Decisions (resolved 2026-07-14)

- **PDF generation: client-side**, reusing the existing `jsPDF` pattern
  from `website-designer.js` exactly — no new backend PDF dependency.
- **PageSpeed Insights API: deferred to v2.** v1 ships with the lighter
  checks in §3 only (mobile viewport, HTTPS, basic SEO, structured data,
  accessibility basics, outdated-tech signals). Revisit real Core Web
  Vitals data once v1 is live and generating leads.
