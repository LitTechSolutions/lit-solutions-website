# Square subscription webhook — setup runbook

The code is written, tested and deployed. **It does nothing until the four
steps below are done.** Until then the endpoint returns `500 Square webhook is
not configured` and rejects everything, which is the safe failure — it never
trusts an unverified request.

---

## What this integration does

Square is the source of truth for whether a website subscription is being paid
for. When a customer subscribes (or Square pauses/cancels them for a failed
payment), Square POSTs an event to us; we verify it came from Square, then
record it.

**A webhook never creates an organization.** When a deposit clears, the
customer has paid us money and has no Care Hub presence — no name we trust, no
verified identity — and `terms.html` §18 states the Care Hub is
invitation-only. Auto-creating a tenant from webhook data would mint a junk org
for every test payment and skip onboarding entirely.

So the flow is:

1. Customer pays on Square → Square sends `subscription.created`
2. We verify and record it in `square_subscription_links`, **unlinked**
3. It appears on the staff onboarding queue
4. You onboard them and link it to an organization, which creates the internal
   `subscriptions` record
5. From then on, Square status changes drive that record automatically

---

## Step 1 — Run migration 007 against Neon

```sql
-- migrations/007_square_subscription_webhooks.sql
```

Same process as 002–006 (applied by hand; see
`docs/development/evidence/migrations/`). It adds:

- `webhook_events.provider_event_id` + a partial unique index on
  `(provider, provider_event_id)` — the idempotency guard
- the `square_subscription_links` table
- a unique index on `subscriptions.provider_subscription_reference`

**Nothing works before this runs**, and the failure will look like a database
error in the function log rather than anything Square-side.

## Step 2 — Create the webhook subscription in Square

Square Developer Dashboard → your application → **Webhooks** → **Subscriptions**
→ Add subscription.

- **Notification URL:**
  `https://lit-solutions.tech/.netlify/functions/square-webhook`
- **API version:** current
- **Events:** `subscription.created` and `subscription.updated`

  Anything else you subscribe to is still verified and logged, then
  acknowledged without action — subscribing to more is harmless but pointless.

Copy the **signature key** it gives you. That is a secret.

## Step 3 — Set two environment variables in Netlify

Netlify → Site configuration → Environment variables. **Set these yourself —
they must never be pasted into a chat, a commit, or a file in this repo.**

| Variable | Value |
|---|---|
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | the signature key from step 2 |
| `SQUARE_WEBHOOK_NOTIFICATION_URL` | `https://lit-solutions.tech/.netlify/functions/square-webhook` |

> **The notification URL is part of the signed message.** It must match what
> you registered in Square character for character — scheme, host, path, and
> trailing slash. If signatures fail for no obvious reason, this is almost
> always why. It is not a redundant setting; Square's algorithm is
> `base64(HMAC-SHA256(key, notificationUrl + rawBody))`.

Redeploy after setting them so the functions pick them up.

## Step 4 — Test it from Square

Square's dashboard has a **Send test event** button on the subscription. Send
one, then check:

- Square reports a `200`
- `GET /.netlify/functions/webhook-events?provider=square` (platform admin)
  shows the delivery with `verified: true`

If Square reports `401`, the signature key or the notification URL is wrong —
those are the only two causes. If it reports `500`, the env vars aren't set or
the migration hasn't run.

---

## Day-to-day: onboarding a new subscriber

**See who has paid but isn't set up yet:**

```
GET /.netlify/functions/square-subscriptions?unlinked=true
```

Platform admin only. Returns Square subscription id, customer id, plan
variation, status, and when it first arrived.

**Link one to an organization** (creates the internal subscription record and
stamps the Square reference onto it):

```
POST /.netlify/functions/square-subscriptions
{ "squareSubscriptionId": "sub_...", "organizationId": "...", "planKey": "website_basic" }
```

If Square already moved the subscription on while it sat unlinked (paused, or
cancelled for a failed payment), linking reconciles to that status immediately
rather than waiting for the next event.

**A customer seeing their own status:**

```
GET /.netlify/functions/square-subscriptions?organizationId=...
```

Any org member with `subscription.view`.

---

## Design notes worth knowing before changing this

**Status mapping.** Square's `DEACTIVATED` maps to our `paused`, not
`cancelled`. `cancelled` is terminal in `src/policy/subscriptionLifecycle.js` —
a cancelled subscription is re-subscribed as a new record, never reactivated in
place. Mapping a recoverable Square state onto it would strand the record
permanently.

**Idempotency is not optional.** Square retries until it receives a 2xx, and —
unlike Stripe — **its signature covers no timestamp**, so there is no replay
window to enforce. Event-id deduplication is the only replay defence available.
That is what the unique `(provider, provider_event_id)` index is for.

**Why business problems return 200.** An unknown subscription, an illegal
transition, an unmapped status — all return `200`. Square retries anything that
isn't 2xx, so returning an error for a permanently-unprocessable event
generates retries forever. Genuine failures (bad signature → 401,
misconfiguration → 500) do return non-2xx, because those *should* be retried or
alarmed on.

**Raw body, always.** Square signs the exact bytes it sent.
`JSON.parse` → `JSON.stringify` reorders keys and changes whitespace, which
breaks verification. `square-webhook.js` reads `event.body` verbatim (decoding
base64 if Netlify encoded it) and only parses *after* verification passes.

**The verifier is Square-specific on purpose.**
`src/webhooks/webhookVerification.js` implements the Stripe-shaped scheme
(hex digest over `timestamp.payload`, replay window). Square is
base64 over `notificationUrl + rawBody` with no timestamp, so it needed its own
verifier in `src/webhooks/squareWebhookVerification.js`. The algorithm is
pinned by a test against Square's own SDK reference implementation
(`square@45 wrapper/WebhooksHelper.js`) — if that test ever fails, the
algorithm drifted; re-read the SDK rather than editing the expectation.

---

## What is deliberately NOT built

- **No customer-facing subscription status on `/myaccount` yet.** The data is
  there (`square-subscriptions?organizationId=`) but nothing renders it. Worth
  doing once there are real subscribers to show it to.
- **No admin UI for the linking queue.** It's API-only today. With a handful of
  subscribers, a `curl` is honestly fine; a screen is worth building when it
  isn't.
- **No handling of `invoice.payment_made` / `invoice.failed`.** Square already
  reflects payment failures in the subscription's own status, which we do
  handle, so these would be duplicate signal. Add them if you want per-invoice
  history rather than current state.
