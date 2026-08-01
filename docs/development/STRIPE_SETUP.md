# Stripe setup runbook

The cart, the checkout and the webhook are written and tested, but **the
whole payment path is inert until the two environment variables below are
set in Netlify.** Until then `/checkout` returns a 500 and the webhook
rejects everything, which is the correct fail-closed behaviour — it is not
a bug to fix, it is this document not having been followed yet.

**Never paste a secret key or webhook secret into a chat, a commit, a
support ticket, or this file.** Both values are set in the Netlify UI only.
If one is ever exposed, roll it in the Stripe dashboard immediately; both
are revocable and rolling them costs nothing but a redeploy.

**Check your progress at any point with:**

```
npm run stripe:check
```

It reports which of these steps have actually landed on the live site. It
never asks for a key and never sends one — it reads the webhook's own
fail-closed status codes (404 = not deployed, 500 = secret missing,
401 = secret set and working).

---

## 0. Deploy the code FIRST

**Do this before anything in the Stripe dashboard.** The webhook endpoint URL
in step 2 has to exist before Stripe can deliver to it — pointing an endpoint
at a 404 just fills your Stripe dashboard with failed attempts.

Push the branch, let Netlify build, and confirm with `npm run stripe:check`
that the two functions report deployed (a 401 from `checkout` is the correct
answer for a signed-out request — it means "sign in required", i.e. the
function is alive).

## 1. Get the secret key

Stripe dashboard → **Developers → API keys** → *Secret key* → **Reveal**.

- It starts `sk_live_…` in live mode, `sk_test_…` in test mode.
- **Start in test mode.** Do the whole runbook with `sk_test_…` first, prove
  a payment end to end, then repeat steps 1–4 with the live key.
- The **publishable** key (`pk_…`) is not used anywhere in this codebase and
  you will never need to paste it in. Checkout is hosted by Stripe, so the
  browser never talks to Stripe directly and there is nothing client-side to
  configure. If a guide tells you to add a publishable key somewhere, that
  guide is describing Stripe Elements, which this site deliberately doesn't
  use — hosted Checkout is what keeps us at PCI SAQ-A.

## 2. Create the webhook endpoint

### The easy way: let the site do it

Once step 0 is done and `STRIPE_SECRET_KEY` is set, sign in as the admin
account and go to **My Account → Stripe setup**. That page uses the key
already in Netlify's environment to:

- report which mode the key is (**test** or **live**) — the mismatch that
  causes most failed setups, and which is otherwise invisible;
- list every webhook endpoint on the account and say exactly what is wrong
  with each one (points elsewhere / missing these events / disabled);
- create the endpoint for you, at the right URL, subscribed to exactly the
  four events the handler implements, automatically in the matching mode;
- show you the signing secret once, to copy into Netlify.

A test asserts the four events it subscribes to are the four
`stripe-webhook.js` actually handles, so the two cannot drift apart.

That page never returns the secret key — only `"test"` or `"live"`, read
from the key's documented prefix. And it deliberately does **not** write the
Netlify variable: that would need Netlify credentials, and an env var this
code could rewrite is one a bug in this code could rewrite.

### The manual way

**The signing secret is not something you make up — Stripe generates it when
you create an endpoint.** Creating the endpoint is what produces the value
you paste into Netlify.

Go straight to the right screen (Stripe has moved this menu more than once;
these URLs have stayed put):

| Mode | URL |
|---|---|
| Test | <https://dashboard.stripe.com/test/webhooks> |
| Live | <https://dashboard.stripe.com/webhooks> |

In the dashboard chrome it's **Developers → Webhooks** (the **Developers**
button sits in the bottom-left toolbar in the current layout), and in the
newer layout **Workbench → Webhooks** or *Event destinations*. All of them
land in the same place.

**Test mode vs Sandboxes.** The account menu (top-left, click the business
name) offers both *Test mode* and *sandboxes*. Either gives you test keys.
Use plain **Test mode** — it's the one the `/test/` dashboard URLs above and
the `4242` card belong to, and it needs no extra setup. Sandboxes are for
running several isolated test environments at once, which we don't need.

> **Match the mode to the key you set.** Test and live are separate worlds
> with separate endpoints and separate signing secrets. A `sk_test_…` key
> needs a **test-mode** endpoint; a `sk_live_…` key needs a **live-mode**
> one. Crossing them produces a 401 on every delivery, and the order sits on
> "Waiting on payment" forever with no other symptom. Check the Test/Live
> toggle before you click Add.

Then **Add endpoint** (or *Add destination*):

- **Endpoint URL:** `https://lit-solutions.tech/.netlify/functions/stripe-webhook`
- **Events to send** — exactly these four, no more:

  | Event | What it does here |
  |---|---|
  | `checkout.session.completed` | Marks the order paid and unlocks the project brief |
  | `checkout.session.async_payment_succeeded` | The same, for buy-now-pay-later and other delayed methods |
  | `checkout.session.async_payment_failed` | Returns the order to awaiting, and emails the customer that nothing was charged |
  | `customer.subscription.deleted` | Records that billing stopped, and reminds you that §9.2 requires written notice before anything goes offline |

  Subscribing to more events is harmless — anything else is acknowledged with
  a 200 and ignored — but there is no reason to.

- After saving, the endpoint's own page shows **Signing secret** — click
  **Reveal**. It starts `whsec_…`. **That** is `STRIPE_WEBHOOK_SECRET`.
  It belongs to this one endpoint: delete and recreate the endpoint and you
  get a new secret, which then has to be updated in Netlify.

## 3. Set the variables in Netlify

Netlify → **Site configuration → Environment variables → Add a variable**.

Both a test and a live set can live there at once. **`STRIPE_MODE` decides
which pair is active**, so switching between them is one variable, not
re-pasting keys:

| `STRIPE_MODE` | Key variable | Webhook secret variable |
|---|---|---|
| `test` | `STRIPE_TEST_KEY` | `STRIPE_TEST_WEBHOOK_SECRET` |
| `live` *(or unset)* | `STRIPE_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET` |

**Unset means live.** A silent default to test would mean real customers
checking out against fake money with no payment ever arriving and nothing on
the site looking wrong — the worst possible failure, so it isn't the default.

Two guards worth knowing about, because both prevent a silent disaster:

- **The key and the webhook secret are always resolved as a pair.** A live
  key verified against a test signing secret 401s every delivery, and the
  only symptom is an order stuck forever on "Waiting on payment" — no error
  page, no failed charge, nothing. `_lib/stripe_config.js` resolves both
  together so one variable can't be changed in isolation.
- **A key whose prefix disagrees with `STRIPE_MODE` is refused outright**,
  in both directions. `sk_live_` in the test slot would charge real cards
  while you believed you were testing; `sk_test_` in the live slot would
  take no money from real customers. Neither proceeds — checkout fails
  loudly and **My Account → Stripe setup** says exactly which variable is
  wrong.

Optional, only if the owner's notification address ever changes:
`ADMIN_NOTIFY_EMAIL` (defaults to `dylan@lit-solutions.tech`).

### Switching between test and live

1. Change `STRIPE_MODE` (and make sure the target mode's two variables are set).
2. Trigger a redeploy.
3. Open **My Account → Stripe setup** — it shows which mode is live, which
   variable it's reading, and which of the four variables Netlify has.

Remember each mode needs its **own** webhook endpoint in Stripe, created in
that mode, with its own signing secret. The setup screen creates one in
whichever mode is active.

## 4. Redeploy

Environment variables are read at function invocation, but Netlify needs a
deploy to pick up a newly added variable. **Deploys → Trigger deploy →
Deploy site.**

## 5. Turn on the payment methods

Stripe dashboard → **Settings → Payments → Payment methods**.

- **Apple Pay and Google Pay** — on by default for hosted Checkout. Nothing
  to build; they appear automatically when the customer's device supports
  them. Apple Pay needs the domain verified, which Stripe does for you on
  its own hosted checkout domain.
- **Klarna / Affirm / Afterpay** — enable whichever you want offered. These
  are what the cart calls "pay over time". The site only advertises them on
  carts that can actually use them (see *Buy now, pay later* below), so
  leaving them off simply means the option never appears.
- **Link** — optional. Speeds up repeat customers.

---

## How to test it before taking real money

Use **test mode** keys and a test-mode webhook endpoint (a separate endpoint
with its own signing secret). Then:

1. Put something in the cart on the live site, sign in, and check out.
2. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
3. You should land back on `/myaccount.html#dashboard`, and within a few
   seconds the order card should flip from "Waiting on payment" to "Payment
   confirmed" **without a refresh** — the page polls briefly for exactly this.
4. You should get the "Paid" email; the customer should get theirs.
5. The project brief should be fillable immediately.

Useful test cards: `4000 0000 0000 9995` declines, `4000 0000 0000 3220`
forces a 3D Secure challenge.

If the order stays on "Waiting on payment", the webhook is the thing to
look at — **Developers → Webhooks → your endpoint → Attempts**. A 401 there
means `STRIPE_WEBHOOK_SECRET` doesn't match; a 500 means it isn't set. Run
`npm run stripe:check` to confirm which.

If checkout won't open at all, sign in as the **admin** account and try
again: an admin gets the real cause back (`adminDetail`, plus a hint naming
the missing variable), where a customer gets the friendly "call us" line.
Check the browser console on `cart.html` for it.

**Switch to live keys only after all of the above passes.** Remember to
create the live-mode webhook endpoint separately — test and live endpoints
have different signing secrets, and a test secret will 401 against live
traffic.

---

## Things that are already decided, so you don't have to re-decide them

**Only website work is checkout-able.** Owner's rule: website services are a
fixed rate and payable on the site; IT services are quoted and invoiced. So
`PRODUCTS` in `netlify/functions/_lib/product_catalog.js` holds website work
only, `INVOICE_ONLY` records the IT services that are published but not
payable, and `QUOTE_ONLY` holds hourly and parts-driven work. Two tests fail
if anything IT-side becomes purchasable again.

**Nothing is created in the Stripe dashboard.** Products and prices are sent
inline with each checkout (`price_data`), from
`netlify/functions/_lib/product_catalog.js`. There are no Stripe product IDs
to maintain and no way for a dashboard name to disagree with the site —
which is exactly the mismatch that happened with Square's product names.
To change a price, change the catalog and run `npm run build:catalog`.

**Money is calculated in exactly one place**, `_lib/pricing.js`. It applies:

- the 50/50 split on buy-outright website builds (terms §3),
- the Heroes Discount — **15% on one-time work, 5% on recurring**, and the
  rate follows the *component*, so a subscription plan's deposit gets 15%
  while its monthly fee gets 5%,
- and the fact that **Stripe bills a recurring line immediately**, so the
  amount taken today is the deposit *plus* the first month.

That last point caused a real bug during development: a $39/month plan
briefly emitted both a "first month" one-off line and a recurring line, and
would have taken $78. There is a test asserting the shown total equals the
sum of the Stripe line items for every product in the catalog under every
combination of hero and pay-in-full. Don't remove it.

**The Heroes Discount can never be self-applied.** `/checkout` reads it from
the account record, never from the request body — a request claiming
`hero: true` is ignored. Verification happens *before* payment, by design:
a discount cannot be applied to a card that has already been charged. The
customer asks from their account, the owner approves from
**My Account → Verify Heroes**, and the status shows on their dashboard at
sign-in so nobody discovers it too late.

**No document is ever collected for verification.** terms.html §10 and the
privacy policy both promise we never receive an unredacted DD-214, LES, or
anything bearing an SSN, and the surest way to keep that promise is to have
no upload field at all. Verification happens in a conversation.

**Buy now, pay later requires paying in full.** Stripe does not support BNPL
in subscription mode, which happens to match the policy: BNPL settles the
full amount with us immediately and the customer repays the provider, so
there is no deposit to split. `/checkout` rejects `useBnpl` without
`payInFull` rather than silently charging a card instead.

**The order exists before the Stripe session.** That is the whole reason for
leaving Square: the order id travels in the session metadata and comes back
on the webhook, so an order goes from `awaiting_payment` straight to `paid`
with no guessing, no "I've completed both payments" button, and no manual
linking. Nothing else may create an order — `POST /orders` returns 410.

---

## What Square is still for

Square is **not** retired. It remains the way to take a payment that didn't
start on the website:

- in-person card payments,
- an invoice for quoted or hourly work,
- the "Pay a Bill" links on `payment.html`.

What Square no longer does is website plans and subscriptions — those moved
to Stripe because Square Payment Links allow only one paid phase per link,
which forced two separate checkouts for a deposit plus a monthly plan.

`docs/development/SQUARE_WEBHOOK_SETUP.md` still applies to the Square side.
The six Square Payment Links for the website plans are now unused; they can
be archived in Square whenever convenient.
