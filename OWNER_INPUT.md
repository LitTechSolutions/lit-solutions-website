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
- **De-duplicated (2026-07-19):** Dylan also added this same testimonial
  through the admin panel (the CMS-managed path `js/cms.js`'s
  `mountTestimonials()` reads from), which meant `testimonials.html`
  briefly showed it twice -- once hardcoded in static HTML, once rendered
  from admin content. Removed the static copy; the admin-entered one
  (already covering the identical approved wording/attribution) is now
  the sole source for that page. The homepage hero placement (`index.html`)
  is unaffected -- it's a separate, deliberate placement, not fed by this
  CMS mechanism, so it still needs its own hardcoded copy.

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

## 4. Outside-customer audit remediation (v27 / v4.4.0) — ITEMS ONLY DYLAN CAN CLOSE

A skeptical-customer review of the live site was run twice (before and
after the v4.3.0 revision). Most findings were fixed in code in v27. The
items below are published on the live site but depend on something only
Dylan can confirm or do. **Read this before deploying v27.**

### 4a. Business commitments now published — confirm you accept them

These are live promises. If any is wrong, fix it *before* deploy:

- **50/50 payment** on fixed-price website work, replacing 100% upfront.
- **30-day workmanship warranty** on our labor (`terms.html` §6A).
- **30 days** (was 7) to report that work wasn't done as agreed.
- **No trip charge** anywhere inside the on-site service area.
- **Domain / files / source code released within 10 business days, free**,
  regardless of how the relationship ended, with no offboarding fee.
- **Heroes Discount eligibility documents deleted within 7 days** of
  verification. This one requires an actual habit, not just copy — if a
  DD-214 is sitting in the inbox 30 days later, the Privacy Policy is
  now factually wrong.

### 4b. Business hours — CONFIRMED BY DYLAN 2026-07-26

**7:00am – 7:00pm ET, seven days a week** (weekends included). Confirmed
directly by Dylan. This replaced an earlier derived guess of Mon–Fri
8:00am–7:00pm, which was wrong on both the opening time and the days.

Published in: the footer of every page, `faq.html` ("What are your
hours?"), `booking.html` (lede + the Morning window, now 7am–12pm), and
the `openingHoursSpecification` in the `LocalBusiness` JSON-LD on 29
pages (Mo–Su 07:00–19:00). "Same business day" response claims were
changed to "same day, seven days a week" to match.

### 4c. Insurance — RESOLVED, deliberately not mentioned

**Owner decision, 2026-07-26: removed from the site entirely.** An earlier
version of `faq.html` carried an "Are you insured?" entry answering
honestly that coverage was not yet in place. Dylan asked for it taken out
— he doesn't want insurance raised as a topic until there's a customer
base that justifies carrying a policy, at which point he'll update it.

The site is now **silent** on insurance rather than claiming anything.
Silence is not a false claim, so nothing published is inaccurate. What
remains, and is the honest part, is Terms section 7: our liability for any
job is capped at what the client paid us for that job. That was always
disclosed and hasn't changed.

Two practical notes for whoever picks this up later:

- **Don't reintroduce it** — no FAQ question, no "insured" badge, nothing
  implying coverage. `CLAUDE.md` carries the same instruction.
- **If a customer or a commercial client asks directly, answer honestly.**
  Some business clients require proof of insurance before letting a
  contractor on site; that conversation will happen eventually and the
  answer needs to match reality, not the website's silence.

When a policy is active, this becomes a genuine selling point worth
putting on the homepage, About and service pages — it was the single
biggest missing trust signal for on-site work in the original audit.

### 4d. Nextdoor page name — CANNOT BE FIXED FROM THIS REPO

Our Nextdoor URL is
`nextdoor.com/page/little-technical-solutuons-llc/` — **"solutuons"**,
misspelled. It resolves, so the Nextdoor page itself was created with the
typo in its name. It appears in the footer of every page and in the
`sameAs` structured data sitewide. Dylan needs to rename the page in
Nextdoor's own settings; once the new URL is known, update the footer
link and the `sameAs` array in all 29 pages' JSON-LD.

### 4e. Facebook link — VERIFY

`facebook.com/profile.php?id=61591618750945` returned HTTP 400 to a
logged-out fetch during the audit. Facebook frequently blocks non-browser
requests, so this may be a false alarm — but please open it in a private
window and confirm a logged-out visitor can actually see the page.

### 4f. Kahai Fuqua review — no direct link

Dylan confirmed this is a real review but no direct review URL was
supplied, so the "Google review" attribution on `index.html` and
`testimonials.html` links to the Google Business profile rather than to
the review itself. A deep link to the individual review would be
stronger; add it if Google exposes one.

The third homepage testimonial ("John Matrix") was **removed** at Dylan's
direction — it read as a placeholder to an outside reader (it is the
protagonist of the film *Commando*), and the Testimonials page
simultaneously said we had no reviews yet.

### 4g. Testimonials page is now static, not empty

`testimonials.html` previously rendered a "More reviews are on the way"
empty state while the homepage showed three five-star reviews — the most
damaging single contradiction in the audit. It now ships the Bill Armour
and Kahai Fuqua reviews as static cards. `js/cms.js`'s
`mountTestimonials()` still replaces that grid wholesale when
admin-entered items exist, so there's no double-render risk — but note
that if the CMS holds only Bill Armour's, adding it via admin will drop
Kahai's from that page. Add both in admin, or leave the static pair.

## 5. Website Subscription plans (v4.5.0) — PRICES ARE PROPOSALS, CONFIRM BEFORE MERGE

Dylan asked for a subscription model: build the site for a small deposit
plus a monthly fee, with Little Technical Solutions retaining ownership
of the build. Three tiers were requested (Basic / Standard / Pro),
offering the same optional features as the one-off builds.

### 5a. Pricing — CONFIRMED BY DYLAN 2026-07-26

| Tier | Deposit | Monthly | Mirrors |
|---|---|---|---|
| Basic | $149 | $79/mo | Starter build ($699) |
| Standard | $249 | $129/mo | Business build ($1,299) |
| Pro | $399 | $199/mo | Business + accounts/admin/security |

All three carry a 12-month minimum term, then continue month to month.

These were originally derived — monthly = (equivalent build price ÷ 24
months) + the $39/mo Website Care baseline, rounded up — and flagged as
proposals needing sign-off. **Dylan reviewed them and confirmed they
stand.** They are no longer provisional.

Year one on Basic works out at $1,097 against $1,167 for buying Starter
outright with the care plan, and every year after costs more ($948/yr vs
$468/yr). That's the honest comparison the Pricing page makes, and it's
why the copy still points most buyers at the outright packages.

The numbers appear in `pricing.html`, `payment.html` and
`website-designer.html`, and nothing reads them from Square at runtime —
**if a price changes in Square it must be changed in all three**, or the
site and the checkout will disagree.

### 5b. Square links — LIVE AND VERIFIED 2026-07-26

Dylan created all six Payment Links. Each was loaded and checked against
the published price before wiring, and each button's label was verified
against the product it actually points at (no deposit/subscription swap):

| Tier | Deposit link | Verified | Subscription link | Verified |
|---|---|---|---|---|
| Basic | `square.link/u/lwgSQrWM` | $149.00 one-time | `square.link/u/fLTqZg7k` | $79.00 / month |
| Standard | `square.link/u/GaFznrtG` | $249.00 one-time | `square.link/u/Y40Brp2x` | $129.00 / month |
| Pro | `square.link/u/av8VJj8O` | $399.00 one-time | `square.link/u/izfCOOLP` | $199.00 / month |

Wired into `pricing.html` (tier cards) and `payment.html` (new
`#website-subscriptions` block). **If you change a price in Square, change
it in both files** — nothing reads it from Square at runtime.

Two things worth knowing:

- **Deposit and subscription are separate checkouts**, so the customer
  pays twice and sees two charges. Both pages say so, and the buttons are
  numbered "1." and "2." to force the order. If you'd rather it were one
  step, Square subscription plans can carry a setup fee — that would
  replace all six links with three.
- **The Heroes Discount has no discounted links.** The pages tell
  eligible customers to contact you to confirm their rate before paying,
  matching how `heroes-pricing.html` already handles it.

### 5b-i. Two-step checkout — kept, with a safety net (2026-07-26)

Square Payment Links only support **one paid phase**, so a deposit and a
recurring charge cannot share a link. Multi-phase plans exist in the
Subscriptions API but the Checkout API can't check out into them, so a
genuine single checkout would mean building our own with the Web Payments
SDK — which moves us from PCI SAQ-A to SAQ-A-EP and introduces a
half-succeeded state (deposit taken, subscription never created).

**Decision: keep two links, mitigate the risk in the page.** With zero
subscription clients, building a custom checkout to remove one click is
optimising a problem we don't have yet.

The mitigation is `js/subscribe-flow.js`: clicking a deposit button records
the tier in `localStorage`, and when the visitor returns to the tab a prompt
appears with the correct subscription link pre-filled. It clears when they
subscribe, is dismissible, and expires after 14 days. It never blocks or
disables step 2 — someone may have paid their deposit by invoice or be
resuming days later.

**Revisit when** there are enough subscription sign-ups to see whether
anyone actually stalls between step 1 and step 2. If Square later adds
setup fees to Payment Links, that collapses six links into three with no
code at all — check that first.

### 5c. What the site now commits you to on ownership

`terms.html` section 9 was restructured into three parts:

- **9.1 Buy-outright** — Starter and Business are unchanged: pay in full,
  you own the files, source and design. Dylan confirmed these stay
  buy-outright.
- **9.2 Subscription** — we own the build and license it while the
  subscription is active. If it ends, the site goes offline **after
  written notice**. Explicitly not rent-to-own. Includes a buy-out path:
  the equivalent one-off build price less everything already paid.
- **9.3 Always the client's, on any plan** — their content, their
  business data, and their domain.

**The buy-out formula needs your sign-off.** "Equivalent build price less
what they've already paid" can reach zero on a long subscription. Consider
a floor (e.g. minimum $199 to cover handover work) or a cap on how much
of the monthly counts toward it.

### 5d. The domain rule you must actually follow

Per Dylan's decision, handling depends on who registered it:

- **Client already owned it** — we never take control; nothing we do
  touches it.
- **We registered it** — it goes in the **client's name, as owner and
  admin contact, from day one**. We only cover the renewal fee. On
  cancellation: transfer billing control on request, and give **at least
  30 days' written notice** before we stop covering renewals.

This is now published in Terms 9.3, the FAQ, and the Pricing page. It is
an operational habit, not just copy — **if a client domain is ever
registered in Dylan's own name, the site is factually wrong.**

The reason for the notice period: an expired domain gets picked up by
squatters quickly, and if the client's email runs on that domain, their
email dies with it. "I stopped paying and they lost their domain" is the
kind of thing that produces an unrecoverable review even when we were
within our rights. The 30-day notice makes it demonstrably their choice.


## 6. Square subscription webhooks — BUILT, NEEDS FOUR SETUP STEPS (2026-07-26)

Dylan asked for the webhook-driven integration rather than manual status
updates: "I know it's more work now but it's the standard and I need to be
there."

**It is written, tested (43 new tests) and deployed — and inert until you
do four things.** Full runbook with the reasoning behind each decision:
`docs/development/SQUARE_WEBHOOK_SETUP.md`.

1. **Run `migrations/007_square_subscription_webhooks.sql` against Neon.**
   Same manual process as migrations 002–006. Nothing works before this.
2. **Create the webhook subscription in the Square dashboard**, pointed at
   `https://lit-solutions.tech/.netlify/functions/square-webhook`, for the
   events `subscription.created` and `subscription.updated`.
3. **Set two environment variables in Netlify** — `SQUARE_WEBHOOK_SIGNATURE_KEY`
   and `SQUARE_WEBHOOK_NOTIFICATION_URL`. Set them yourself in the Netlify UI;
   they must never be pasted into a chat or committed. Redeploy afterwards.
4. **Send a test event from Square** and confirm a 200, then check
   `GET /.netlify/functions/webhook-events?provider=square`.

Until step 3 the endpoint returns 500 and rejects everything, which is the
safe failure mode — it never trusts an unverified request.

### The one design decision you should agree with

**A webhook never creates an organization.** When someone's deposit clears
they have paid us money and have no Care Hub account, no verified identity,
and `terms.html` §18 says the Care Hub is invitation-only. Auto-creating a
tenant from webhook data would produce a junk organization for every test
payment and skip onboarding entirely.

So every Square subscription lands **unlinked** on a queue:

```
GET  /.netlify/functions/square-subscriptions?unlinked=true
POST /.netlify/functions/square-subscriptions
     { "squareSubscriptionId": "...", "organizationId": "...", "planKey": "..." }
```

You link it during onboarding, which creates the internal subscription
record. After that, Square status changes flow through automatically.

**This means a paid subscription sits waiting for you.** With a handful of
customers that is correct and safe. If it ever becomes a bottleneck, the fix
is an admin screen for the queue, not auto-provisioning.

### Subscription status — DONE, in the Care Hub (2026-07-26)

Built on the Care Hub's Subscriptions screen, not `/myaccount`.
`myaccount.html`'s `maybeRedirectToCareHub()` sends any customer with an
organization membership straight to `/care-hub/`, and a linked subscription
customer always has one — so `/myaccount` would have been a page the
audience never reaches.

It shows our lifecycle status and Square's billing status as separate
facts, including when they disagree. Previously only ours was shown, which
reads "active" until a webhook lands — so a customer whose card had been
declined would have been reassured while Square had already stopped
billing.

### Deliberately not built — owner decision, 2026-07-26

**The pre-link gap: leave it until there are subscribers actually sitting
in it.** Dylan's call, and a reasonable one — the edge cases are easier to
get right against a real case than a guessed one.

The gap: someone who has paid on Square but has not yet been linked to an
organization has no membership, so they stay on `/myaccount` and see
nothing about the subscription they just paid for. They cannot currently be
matched to their payment either — the subscription webhook payload carries
`customer_id`, not an email address.

Closing it would need a call to Square's Customers API (and therefore a
`SQUARE_ACCESS_TOKEN` env var) to populate
`square_subscription_links.customer_email`. That column already exists for
this purpose and is always null today; **do not remove it as dead schema.**

Until then the gap is covered by onboarding within one business day, which
the plan pages already promise.

Also not built, for the same "wait for real demand" reason:

- An admin UI for the linking queue — API-only today. With a handful of
  subscribers a `curl` is honestly fine.
- `invoice.payment_made` / `invoice.failed` handling — Square already
  reflects payment failure in the subscription status we do handle, so this
  would be duplicate signal unless per-invoice history is wanted.
