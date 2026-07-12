# v1.12 Business Tier Upgrade — What Changed

## What was preserved exactly (byte-for-byte, verified)
- Logo files, favicon, color theme (all CSS custom properties), IBM Plex fonts
- All 3 live Square links: payment (`2oozkfhz`), Website Care Plan subscription
  (`lmJbZea7`), Small Business IT subscription (`CrpV0Rqf`)
- The entire American Heroes Discount program (`heroes-pricing.html`) — content untouched
- The project intake form (`intake.html` + `intake.js`) — your existing lead-capture
  mechanism, byte-identical, still the primary way customers message you
- Terms & Conditions, Subscriptions page, Payment page — content untouched
- Dark/light mode toggle, mobile nav, scroll-reveal animations, the animated hero
  diagram, the before/after website slider, the ticket-card expand behavior, the
  terms-agreement payment gate — all original JS behavior kept as-is
- Patch notes history (v1.0–v1.11) — untouched, with v1.12 added on top

Verified with a byte-diff against your uploaded files, not just eyeballed.

## What's new

**Pages split out from the homepage** (Business tier requires dedicated About/Services/Contact):
- `about.html` — your full veteran-owned story, credentials, and stats (moved verbatim)
- `services.html` — the full 5-category ticket grid + the before/after slider (moved verbatim)
- `contact.html` — your contact details and project-form CTA (moved verbatim)
- `index.html` is now a leaner true homepage with condensed teasers linking to each

**Genuinely new pages:**
- 5 service-detail pages (one per category) — benefits, full service list, process,
  service-specific FAQs, related services
- `service-area.html` — local in-person area vs. nationwide website design, spelled out clearly
- `testimonials.html` — honest "we're new" placeholder instead of fake reviews, ready
  to hold real ones once you have them
- `faq.html` — 11 real questions grounded in your actual pricing/policies
- `booking.html` — infrastructure ready, honestly states no platform is connected yet
  (same pattern as your `#REPLACE_WITH_SQUARE_...` placeholders)
- `blog.html` + 3 real articles I wrote (website redesign signs, password managers,
  Wi-Fi dead zones) + an email signup

**Navigation:** Services and Resources are now dropdowns (new, built to match your
existing design language) so the larger page set doesn't clutter the header.

**Pricing page:** added a Starter vs. Business feature-by-feature package comparison
above your existing "How we compare" market-rate table (which I left exactly as it was —
it already did the savings-callout job well).

**Homepage:** added the tagline "Modernizing the Northern Neck, One Small Business at a
Time," plus nationwide-website-design messaging on the homepage, Services, Contact, and
Service Area pages.

## Things that need your attention before/after launch

1. **Booking platform.** `booking.html` has no scheduling link yet. Once you set up
   Calendly (or whatever you choose), give me the URL and I'll wire it into the existing
   `booking-embed` styling — no rebuild needed.
2. **Blog article images.** The 3 articles don't have featured images (I didn't fabricate
   stock photos). Purely optional — text-only articles work fine as-is.
3. **Testimonials.** Once you have 2–3 real reviews, send them over and I'll swap out the
   placeholder state for real testimonial cards (CSS is already built).
4. **Service-detail page copy.** I wrote benefit/process/FAQ copy grounded in your real
   pricing and service lists, but you know these jobs better than I do — worth a read
   before it goes live in case anything doesn't sound right.

## Verification performed
- 0 broken internal links across all 24 pages (automated check)
- 0 HTML structural errors (automated tag-balance check)
- All CSS classes used are defined (no dead/missing styles)
- Every page confirmed on v1.12 in the footer
- All 3 Square links confirmed present and unchanged
