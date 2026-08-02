/* The Stripe money path, end to end against stubs.
 *
 * The thing under test is not "does it call Stripe" -- it's whether the
 * number a customer is SHOWN is the number Stripe is ASKED FOR, under every
 * combination of the three rules that interact: the 50/50 split, the Heroes
 * Discount, and buy-now-pay-later. Getting that wrong is not a broken page,
 * it's an overcharge, and it already happened once in development (a $39
 * plan emitting both a "first month" one-off and a recurring line, taking
 * $78). Most of what follows exists to make that class of bug loud.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const crypto = require("node:crypto");

const NOW = () => new Date("2026-08-01T12:00:00.000Z");

const blobs = new Map();
const sent = [];
const k = (s, key) => `${s}::${key}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

const stubBlob = {
  getJSON: async (s, key) => (blobs.has(k(s, key)) ? clone(blobs.get(k(s, key))) : null),
  setJSON: async (s, key, v) => { blobs.set(k(s, key), clone(v)); },
  deleteKey: async (s, key) => { blobs.delete(k(s, key)); },
  store: (s) => ({
    list: async () => ({ blobs: [...blobs.keys()].filter((x) => x.startsWith(s + "::")).map((x) => ({ key: x.slice(s.length + 2) })) }),
    get: async (key) => (blobs.has(k(s, key)) ? clone(blobs.get(k(s, key))) : null),
  }),
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (/(^|\/)blob_store$/.test(request)) return stubBlob;
  if (/(^|\/)email$/.test(request)) return { sendEmail: async (m) => { sent.push(clone(m)); } };
  if (/(^|\/)auth_utils$/.test(request)) {
    return { ...origLoad.call(this, request, parent, isMain), rateLimited: async () => false };
  }
  return origLoad.call(this, request, parent, isMain);
};
const checkout = require("../netlify/functions/checkout.js");
const webhook = require("../netlify/functions/stripe-webhook.js");
const heroStatus = require("../netlify/functions/hero-status.js");
const billing = require("../netlify/functions/billing-portal.js");
const stripeSetup = require("../netlify/functions/stripe-setup.js");
const { priceCart, toStripeLineItems, bnplAvailable } = require("../netlify/functions/_lib/pricing.js");
const { getProduct, listProducts } = require("../netlify/functions/_lib/product_catalog.js");
const { formEncode } = require("../netlify/functions/_lib/stripe_api.js");
Module._load = origLoad;

function reset() { blobs.clear(); sent.length = 0; }

/* A REAL session is exactly {sessionId, userId, role, expiresAt} -- see
 * auth_utils.createSession(userId, role). It carries NO email. These doubles
 * used to include one, which is precisely why the suite stayed green while
 * production hung for 25 seconds on getJSON("users", "") and died with
 * "Failed to parse URL from undefined". Do not add an email back. */
const CUST_EMAIL = "jane@example.test";
const ADMIN_EMAIL_ADDR = "dylan@lit-solutions.tech";
const CUST = { sessionId: "s-1", userId: "cust-1", role: "customer", expiresAt: 4102444800000 };
const ADMIN = { sessionId: "s-2", userId: "admin-1", role: "admin", expiresAt: 4102444800000 };
const emailOf = (session) => (session.userId === "admin-1" ? ADMIN_EMAIL_ADDR : CUST_EMAIL);

function seedUser(session, heroState, email) {
  const addr = email || emailOf(session);
  blobs.set(k("users", addr.toLowerCase()), {
    id: session.userId, email: addr, name: "Jane",
    heroStatus: heroState ? { state: heroState, category: "Veteran" } : undefined,
  });
}

const req = (method, body, qs) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : undefined,
  queryStringParameters: qs || null,
  headers: { host: "lit-solutions.tech", "x-forwarded-proto": "https" },
});

let lastSessionParams = null;
function deps(session, extra = {}) {
  return {
    readCookie: () => "t",
    getSession: async () => session,
    now: NOW,
    idGenerator: () => "ord-test",
    createCheckoutSession: async (params) => {
      lastSessionParams = params;
      return { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" };
    },
    ...extra,
  };
}

const cents = (n) => Math.round(n * 100);

/* ================================================================ pricing = */

test("charged-today always equals the sum of the Stripe line items", () => {
  // Exhaustive over the catalog, not a hand-picked sample: any product added
  // later is covered the day it's added.
  for (const product of listProducts()) {
    for (const hero of [false, true]) {
      for (const payInFull of [false, true]) {
        const priced = priceCart([{ product, quantity: 1 }], { hero, payInFull });
        const total = toStripeLineItems(priced).reduce((s, l) => s + l.price_data.unit_amount, 0);
        assert.equal(total, priced.chargedTodayCents,
          `${product.key} hero=${hero} full=${payInFull}: shown ${priced.chargedTodayCents}, charged ${total}`);
      }
    }
  }
});

test("quantity multiplies the charge and the line, not just the label", () => {
  const priced = priceCart([{ product: getProduct("svc-seo"), quantity: 3 }], {});
  assert.equal(priced.chargedTodayCents, cents(99) * 3);
  const lines = toStripeLineItems(priced);
  assert.equal(lines.length, 1);
  // The amount already has the quantity folded in, so the Stripe quantity
  // must stay 1 or it would be multiplied twice.
  assert.equal(lines[0].quantity, 1);
  assert.equal(lines[0].price_data.unit_amount, cents(297));
  assert.match(lines[0].price_data.product_data.name, /× 3/);
});

test("a pure subscription bills its first month once, through the recurring line", () => {
  for (const key of ["care-plan", "it-support"]) {
    const product = getProduct(key);
    const priced = priceCart([{ product, quantity: 1 }], {});
    const lines = toStripeLineItems(priced);
    assert.equal(lines.length, 1, `${key}: expected one line, got ${lines.length}`);
    assert.ok(lines[0].price_data.recurring, `${key}: the line must be recurring`);
    assert.equal(priced.chargedTodayCents, product.monthlyCents, `${key}: double-charged`);
  }
});

test("a plan charges deposit plus first month today, then the monthly alone", () => {
  const priced = priceCart([{ product: getProduct("plan-premium"), quantity: 1 }], {});
  assert.equal(priced.chargedTodayCents, cents(249) + cents(129));
  assert.equal(priced.monthlyCents, cents(129));
  assert.equal(priced.includesFirstMonth, true, "the cart has to be able to explain the difference");
});

test("the Heroes rate follows the component, not the product", () => {
  const priced = priceCart([{ product: getProduct("plan-executive"), quantity: 1 }], { hero: true });
  const line = priced.lines[0];
  assert.equal(line.oneOffCents, Math.round(cents(399) * 0.85), "a deposit is one-time work: 15%");
  assert.equal(line.monthlyCents, Math.round(cents(199) * 0.95), "a monthly fee is recurring: 5%");
  assert.equal(priced.heroSavingCents, (cents(399) + cents(199)) - priced.chargedTodayCents);
});

test("a 50/50 build never loses or duplicates the balance", () => {
  for (const key of ["package-starter", "package-business"]) {
    const product = getProduct(key);
    for (const hero of [false, true]) {
      const half = priceCart([{ product, quantity: 1 }], { hero });
      const expectedTotal = hero ? Math.round(product.totalCents * 0.85) : product.totalCents;
      assert.equal(half.chargedTodayCents + half.balanceAtLaunchCents, expectedTotal, `${key} hero=${hero}`);
      assert.ok(half.chargedTodayCents >= half.balanceAtLaunchCents, `${key}: balance is the larger half`);

      const full = priceCart([{ product, quantity: 1 }], { hero, payInFull: true });
      assert.equal(full.chargedTodayCents, expectedTotal);
      assert.equal(full.balanceAtLaunchCents, 0);
    }
  }
});

test("buy now, pay later is offered only where it can actually work", () => {
  const one = (key) => [{ product: getProduct(key), quantity: 1 }];

  // Stripe has no BNPL in subscription mode -- which matches our own policy,
  // since BNPL settles in full and there is no deposit to split.
  for (const key of ["plan-premium", "care-plan", "it-support"]) {
    assert.equal(bnplAvailable(one(key), priceCart(one(key), { payInFull: true })), false, key);
  }
  // A pure one-off cart above the provider floor is fine.
  assert.equal(bnplAvailable(one("package-starter"), priceCart(one("package-starter"), { payInFull: true })), true);

  // And below the floor it is not offered, because the provider would reject
  // it on Stripe's page and that reads as "declined" to a customer.
  const cheap = one("svc-domain-setup");
  assert.equal(bnplAvailable(cheap, priceCart(cheap, { payInFull: true })), false, "$39 is under the BNPL minimum");
});

/* =============================================================== checkout = */

test("checkout requires a session", async () => {
  reset();
  const res = await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {},
    { readCookie: () => null, getSession: async () => null });
  assert.equal(res.statusCode, 401);
});

test("the discount comes from the account, never from the request", async () => {
  reset();
  seedUser(CUST, null);   // NOT a verified hero
  const res = await checkout.handler(
    // A hand-crafted request claiming every possible discount.
    req("POST", { items: [{ key: "plan-premium", quantity: 1 }], hero: true, heroStatus: "verified", discount: 0.9 }),
    {}, deps(CUST));
  assert.equal(res.statusCode, 200);
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.hero, false, "a self-declared discount is just a price the customer picked");
  assert.equal(order.pricing.chargedTodayCents, cents(249) + cents(129));
});

test("a verified hero is charged the hero price without asking for it", async () => {
  reset();
  seedUser(CUST, "verified");
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {}, deps(CUST));
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.hero, true);
  assert.equal(order.pricing.chargedTodayCents, Math.round(cents(249) * 0.85) + Math.round(cents(129) * 0.95));
});

test("a PENDING hero is charged full price -- verification happens before payment", async () => {
  reset();
  seedUser(CUST, "pending");
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {}, deps(CUST));
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.hero, false);
  assert.equal(order.pricing.chargedTodayCents, cents(249) + cents(129));
});

test("the order exists before the Stripe session, and its id rides in the metadata", async () => {
  reset();
  seedUser(CUST, null);
  const res = await checkout.handler(req("POST", { items: [{ key: "package-starter", quantity: 1 }] }), {}, deps(CUST));
  assert.equal(res.statusCode, 200);
  const { orderId, url } = JSON.parse(res.body);
  assert.equal(orderId, "ord-test");
  assert.match(url, /^https:\/\/checkout\.stripe\.com\//);

  // This is the whole reason for leaving Square: the webhook comes back
  // knowing exactly which order was paid.
  assert.equal(lastSessionParams.metadata.orderId, "ord-test");
  assert.equal(lastSessionParams.mode, "payment");
  assert.match(lastSessionParams.successUrl, /checkout=success/);
  assert.equal(lastSessionParams.customerEmail, CUST_EMAIL, "the address must come from the user record, not the session");
});

test("a cart with anything recurring runs in subscription mode", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }, { key: "care-plan", quantity: 1 }] }), {}, deps(CUST));
  assert.equal(lastSessionParams.mode, "subscription");
  // Session metadata is not copied to the subscription, and a cancellation
  // months later arrives referencing the subscription -- so it must be set
  // in both places or there is nothing to match on.
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.pricing.hasRecurring, true);
});

test("unknown, duplicated and absurd cart entries are neutralised", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", {
    items: [
      { key: "free-website-please", quantity: 1 },   // invented
      { key: "svc-seo", quantity: 999 },             // over the cap
      { key: "svc-seo", quantity: 1 },               // duplicate line
      { key: "svc-domain-setup", quantity: -5 },             // nonsense
    ],
  }), {}, deps(CUST));
  const order = blobs.get(k("orders", "ord-test"));
  assert.deepEqual(order.items.map((i) => i.key), ["svc-seo", "svc-domain-setup"]);
  assert.equal(order.items[0].quantity, 20, "quantity should clamp, not throw");
  assert.equal(order.items[1].quantity, 1, "a negative quantity becomes one");
});

test("an empty cart can't open a checkout", async () => {
  reset();
  seedUser(CUST, null);
  const res = await checkout.handler(req("POST", { items: [] }), {}, deps(CUST));
  assert.equal(res.statusCode, 400);
  assert.equal(blobs.has(k("orders", "ord-test")), false, "no order should be left behind");
});

test("BNPL is refused on a cart that can't take it, rather than silently ignored", async () => {
  reset();
  seedUser(CUST, null);
  // Recurring cart: Stripe has no BNPL in subscription mode.
  const r1 = await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }], useBnpl: true, payInFull: true }), {}, deps(CUST));
  assert.equal(r1.statusCode, 400);
  assert.match(JSON.parse(r1.body).error, /pay later/i);

  // Policy: BNPL settles in full, so there is no 50/50 to split.
  const r2 = await checkout.handler(req("POST", { items: [{ key: "package-business", quantity: 1 }], useBnpl: true, payInFull: false }), {}, deps(CUST));
  assert.equal(r2.statusCode, 400);
  assert.match(JSON.parse(r2.body).error, /full amount/i);

  // And the legitimate combination goes through.
  const r3 = await checkout.handler(req("POST", { items: [{ key: "package-business", quantity: 1 }], useBnpl: true, payInFull: true }), {}, deps(CUST));
  assert.equal(r3.statusCode, 200);
});

test("a failed Stripe call leaves a diagnosable order, not a silent hole", async () => {
  reset();
  seedUser(CUST, null);
  const res = await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {},
    deps(CUST, { createCheckoutSession: async () => { throw new Error("card_declined_at_session"); } }));
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /804-309-0968/);
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.status, "checkout_failed");
  assert.match(order.checkoutError, /card_declined_at_session/);
});

test("a missing key is legible to an admin and still gentle to a customer", async () => {
  reset();
  seedUser(CUST, null);
  seedUser(ADMIN, null);
  const unconfigured = { createCheckoutSession: async () => { throw new Error("STRIPE_SECRET_KEY is not configured."); } };

  const cust = await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {}, deps(CUST, unconfigured));
  const custBody = JSON.parse(cust.body);
  assert.equal(cust.statusCode, 502);
  assert.match(custBody.error, /804-309-0968/);
  assert.equal(custBody.adminDetail, undefined, "a customer must not be shown internals");
  assert.equal(custBody.adminHint, undefined);

  const admin = await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {}, deps(ADMIN, unconfigured));
  const adminBody = JSON.parse(admin.body);
  assert.match(adminBody.adminDetail, /STRIPE_SECRET_KEY/);
  assert.match(adminBody.adminHint, /Netlify/);
  assert.match(adminBody.adminHint, /redeploy/);
});

test("GET prices a cart without creating anything", async () => {
  reset();
  seedUser(CUST, "verified");
  const res = await checkout.handler(req("GET", null, { items: "plan-standard:1,svc-seo:2" }), {}, deps(CUST));
  const body = JSON.parse(res.body);
  assert.equal(body.hero, true);
  assert.equal(body.priced.lines.length, 2);
  assert.equal(blobs.size, 1, "pricing a cart must not write an order");
});

test("an IT service can't be priced or bought, even by asking for it directly", async () => {
  reset();
  seedUser(CUST, null);
  // These were checkout-able for one afternoon during development. IT work is
  // quoted and invoiced, so a saved link or a hand-typed key must not revive
  // a price for a job nobody has scoped.
  const RETIRED = ["svc-mfa", "svc-wifi", "svc-office-network", "svc-workstation", "svc-mesh"];

  const priced = await checkout.handler(
    req("GET", null, { items: RETIRED.map((k) => `${k}:1`).join(",") }), {}, deps(CUST));
  assert.equal(JSON.parse(priced.body).empty, true, "an all-IT cart must price to nothing");

  const posted = await checkout.handler(
    req("POST", { items: RETIRED.map((key) => ({ key, quantity: 1 })) }), {}, deps(CUST));
  assert.equal(posted.statusCode, 400);
  assert.equal(blobs.has(k("orders", "ord-test")), false, "no order may be created for IT work");

  // Mixed in with something legitimate, the IT lines are dropped rather than
  // dragging the whole cart down.
  await checkout.handler(
    req("POST", { items: [{ key: "svc-mfa", quantity: 1 }, { key: "svc-seo", quantity: 1 }] }), {}, deps(CUST));
  const order = blobs.get(k("orders", "ord-test"));
  assert.deepEqual(order.items.map((i) => i.key), ["svc-seo"]);
});

/* --------------------------------------------------------------- resume -- */

test("an abandoned checkout resumes on the SAME order rather than making a second", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {}, deps(CUST));
  const before = [...blobs.keys()].filter((x) => x.startsWith("orders::")).length;

  const res = await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(CUST, { idGenerator: () => "ord-SECOND" }));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).orderId, "ord-test");
  assert.equal([...blobs.keys()].filter((x) => x.startsWith("orders::")).length, before, "resume must not create a second order");
});

test("resuming re-prices, so a hero verified in the meantime gets their discount", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {}, deps(CUST));
  assert.equal(blobs.get(k("orders", "ord-test")).pricing.chargedTodayCents, cents(249) + cents(129));

  seedUser(CUST, "verified");   // Dylan verified them between attempts
  await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(CUST));
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.hero, true);
  assert.equal(order.pricing.chargedTodayCents, Math.round(cents(249) * 0.85) + Math.round(cents(129) * 0.95));
});

test("the idempotency key changes when the price does, and holds when it doesn't", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {}, deps(CUST));
  const firstKey = lastSessionParams.idempotencyKey;

  // A double click: same order, same cart, same price -> same session.
  await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(CUST));
  assert.equal(lastSessionParams.idempotencyKey, firstKey, "a double click must not mint a second session");

  // Re-priced: a new session is required, or Stripe hands back the old amount.
  seedUser(CUST, "verified");
  await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(CUST));
  assert.notEqual(lastSessionParams.idempotencyKey, firstKey, "a re-priced resume must get a new session");
});

test("resuming someone else's order, or a paid one, is refused", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {}, deps(CUST));

  const other = { sessionId: "s-3", userId: "cust-2", role: "customer", expiresAt: 4102444800000 };
  seedUser(other, null, "someone@else.test");
  assert.equal((await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(other))).statusCode, 403);

  const o = blobs.get(k("orders", "ord-test"));
  o.status = "paid";
  blobs.set(k("orders", "ord-test"), o);
  assert.equal((await checkout.handler(req("POST", { orderId: "ord-test" }), {}, deps(CUST))).statusCode, 409);
});

/* ================================================================ webhook = */

const WH_SECRET = "whsec_test_secret";

function signed(payload, { secret = WH_SECRET, timestamp = Math.floor(NOW().getTime() / 1000) } = {}) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    httpMethod: "POST",
    body,
    headers: { "stripe-signature": `t=${timestamp},v1=${sig}` },
    queryStringParameters: null,
  };
}

const whDeps = { env: { STRIPE_WEBHOOK_SECRET: WH_SECRET }, now: NOW };

function seedOrder(over = {}) {
  const priced = priceCart([{ product: getProduct("plan-premium"), quantity: 1 }], {});
  const o = {
    id: "ord-test", customerId: CUST.userId, customerEmail: CUST_EMAIL,
    items: [{ key: "plan-premium", name: "Premium", quantity: 1 }],
    pricing: priced, status: "awaiting_payment", provider: "stripe",
    createdAt: NOW().toISOString(), ...over,
  };
  blobs.set(k("orders", o.id), o);
  return o;
}

test("an unsigned or wrongly-signed webhook is rejected before anything is read", async () => {
  reset();
  seedOrder();
  const evt = { type: "checkout.session.completed", data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid" } } };

  const noSig = { ...signed(evt), headers: {} };
  assert.equal((await webhook.handler(noSig, {}, whDeps)).statusCode, 401);

  const wrongSecret = signed(evt, { secret: "whsec_attacker" });
  assert.equal((await webhook.handler(wrongSecret, {}, whDeps)).statusCode, 401);

  // Replays outside the tolerance window are refused -- Stripe signs the
  // timestamp, so this is real protection rather than an approximation.
  const stale = signed(evt, { timestamp: Math.floor(NOW().getTime() / 1000) - 3600 });
  assert.equal((await webhook.handler(stale, {}, whDeps)).statusCode, 401);

  assert.equal(blobs.get(k("orders", "ord-test")).status, "awaiting_payment", "nothing may change on a bad signature");
});

test("a valid completed session marks the order paid and tells both sides", async () => {
  reset();
  seedOrder();
  const res = await webhook.handler(signed({
    type: "checkout.session.completed",
    data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid", amount_total: 37800, customer: "cus_1", subscription: "sub_1" } },
  }), {}, whDeps);

  assert.equal(res.statusCode, 200);
  const order = blobs.get(k("orders", "ord-test"));
  assert.equal(order.status, "paid");
  assert.equal(order.amountPaidCents, 37800);
  assert.equal(order.stripeCustomerId, "cus_1");
  assert.equal(order.stripeSubscriptionId, "sub_1");

  assert.ok(sent.find((m) => m.to === "dylan@lit-solutions.tech"), "the owner should be told");
  assert.ok(sent.find((m) => m.to === "jane@example.test"), "the customer should be told");
});

test("a redelivered webhook doesn't email twice or reopen a finished order", async () => {
  reset();
  seedOrder();
  const evt = signed({
    type: "checkout.session.completed",
    data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid", amount_total: 37800 } },
  });
  await webhook.handler(evt, {}, whDeps);
  const after = sent.length;
  await webhook.handler(evt, {}, whDeps);
  assert.equal(sent.length, after, "a redelivery must not re-notify");

  // And it must not drag a submitted brief back to merely paid.
  const o = blobs.get(k("orders", "ord-test"));
  o.status = "brief_submitted";
  blobs.set(k("orders", "ord-test"), o);
  await webhook.handler(evt, {}, whDeps);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "brief_submitted");
});

test("a delayed payment method is held at processing until the money confirms", async () => {
  reset();
  seedOrder();
  await webhook.handler(signed({
    type: "checkout.session.completed",
    data: { object: { metadata: { orderId: "ord-test" }, payment_status: "unpaid" } },
  }), {}, whDeps);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "payment_processing");
  assert.equal(sent.length, 0, "nothing is confirmed yet, so nobody should be told it is");

  await webhook.handler(signed({
    type: "checkout.session.async_payment_succeeded",
    data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid", amount_total: 37800 } },
  }), {}, whDeps);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "paid");
});

test("a failed delayed payment goes back to awaiting, and says nothing was charged", async () => {
  reset();
  seedOrder({ status: "payment_processing" });
  await webhook.handler(signed({
    type: "checkout.session.async_payment_failed",
    data: { object: { metadata: { orderId: "ord-test" } } },
  }), {}, whDeps);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "awaiting_payment");
  const mail = sent.find((m) => m.to === "jane@example.test");
  assert.match(mail.html, /nothing has been charged/i);
});

test("an event we can't match is acknowledged, not retried forever", async () => {
  reset();
  for (const evt of [
    { type: "checkout.session.completed", data: { object: { metadata: {} } } },
    { type: "checkout.session.completed", data: { object: { metadata: { orderId: "does-not-exist" } } } },
    { type: "invoice.payment_succeeded", data: { object: {} } },
  ]) {
    const res = await webhook.handler(signed(evt), {}, whDeps);
    assert.equal(res.statusCode, 200, `${evt.type} must be acknowledged`);
  }
});

test("a cancelled subscription is recorded and flagged for written notice", async () => {
  reset();
  seedOrder({ status: "paid", stripeSubscriptionId: "sub_1" });
  await webhook.handler(signed({
    type: "customer.subscription.deleted",
    data: { object: { metadata: { orderId: "ord-test" } } },
  }), {}, whDeps);
  assert.ok(blobs.get(k("orders", "ord-test")).subscriptionEndedAt);
  const mail = sent.find((m) => m.to === "dylan@lit-solutions.tech");
  // terms.html 9.2 promises written notice before a site goes offline. The
  // webhook must not be allowed to quietly become "switch it off".
  assert.match(mail.html, /written notice/i);
});

test("a base64 body verifies against the decoded bytes", async () => {
  reset();
  seedOrder();
  const plain = signed({
    type: "checkout.session.completed",
    data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid", amount_total: 37800 } },
  });
  const encoded = { ...plain, body: Buffer.from(plain.body, "utf8").toString("base64"), isBase64Encoded: true };
  assert.equal((await webhook.handler(encoded, {}, whDeps)).statusCode, 200);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "paid");
});

test("a missing webhook secret fails loudly rather than accepting anything", async () => {
  reset();
  seedOrder();
  const res = await webhook.handler(signed({ type: "checkout.session.completed", data: { object: {} } }), {}, { env: {}, now: NOW });
  assert.equal(res.statusCode, 500);
});

/* ============================================================ hero status = */

test("a customer can request the discount but cannot grant it to themselves", async () => {
  reset();
  seedUser(CUST, null);
  const res = await heroStatus.handler(req("POST", { category: "Veteran" }), {}, deps(CUST));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).status.state, "pending", "a request is pending, never verified");

  // The admin-only route must refuse them.
  const escalate = await heroStatus.handler(req("PATCH", { customerEmail: CUST_EMAIL, decision: "verified" }), {}, deps(CUST));
  assert.equal(escalate.statusCode, 403);
  assert.equal(blobs.get(k("users", CUST_EMAIL)).heroStatus.state, "pending");
});

test("an invented category is refused", async () => {
  reset();
  seedUser(CUST, null);
  const res = await heroStatus.handler(req("POST", { category: "Very Important Person" }), {}, deps(CUST));
  assert.equal(res.statusCode, 400);
});

test("the request email tells the owner how to verify without an SSN document", async () => {
  reset();
  seedUser(CUST, null);
  await heroStatus.handler(req("POST", { category: "Veteran", note: "USN 2014-2020" }), {}, deps(CUST));

  const toOwner = sent.find((m) => m.to === "dylan@lit-solutions.tech");
  assert.match(toOwner.html, /Do not accept an unredacted DD-214/i);
  const toCustomer = sent.find((m) => m.to === CUST_EMAIL);
  assert.match(toCustomer.html, /Social Security number/i);
});

test("an admin decision sticks, and the customer is told either way", async () => {
  reset();
  seedUser(CUST, null);
  await heroStatus.handler(req("POST", { category: "Teacher" }), {}, deps(CUST));
  sent.length = 0;

  await heroStatus.handler(req("PATCH", { customerEmail: CUST_EMAIL, decision: "verified" }), {}, deps(ADMIN));
  assert.equal(blobs.get(k("users", CUST_EMAIL)).heroStatus.state, "verified");
  assert.match(sent.find((m) => m.to === CUST_EMAIL).html, /15% off one-time work/);

  sent.length = 0;
  await heroStatus.handler(req("PATCH", { customerEmail: CUST_EMAIL, decision: "declined" }), {}, deps(ADMIN));
  assert.equal(blobs.get(k("users", CUST_EMAIL)).heroStatus.state, "declined");
  assert.match(sent.find((m) => m.to === CUST_EMAIL).html, /804-309-0968/);
});

test("the verification queue is admin-only and ordered oldest first", async () => {
  reset();
  seedUser(CUST, null);
  const other = { sessionId: "s-4", userId: "cust-2", role: "customer", expiresAt: 4102444800000 };
  seedUser(other, null, "bob@example.test");

  await heroStatus.handler(req("POST", { category: "Veteran" }), {}, deps(other, { now: () => new Date("2026-07-01T00:00:00Z") }));
  await heroStatus.handler(req("POST", { category: "Police" }), {}, deps(CUST));

  assert.equal((await heroStatus.handler(req("GET", null, { pending: "true" }), {}, deps(CUST))).statusCode, 403);

  const res = await heroStatus.handler(req("GET", null, { pending: "true" }), {}, deps(ADMIN));
  const queue = JSON.parse(res.body).pending;
  assert.equal(queue.length, 2);
  assert.equal(queue[0].email, "bob@example.test", "oldest request should be first");
});

test("re-requesting when already verified doesn't downgrade the account", async () => {
  reset();
  seedUser(CUST, "verified");
  await heroStatus.handler(req("POST", { category: "Doctor" }), {}, deps(CUST));
  assert.equal(blobs.get(k("users", CUST_EMAIL)).heroStatus.state, "verified");
});

/* ========================================================= billing portal = */

test("the billing portal needs a real Stripe customer, and only your own", async () => {
  reset();
  blobs.set(k("orders", "o1"), { id: "o1", customerId: CUST.userId, stripeCustomerId: "cus_1", createdAt: "2026-01-01" });

  const portalDeps = (session) => deps(session, {
    createBillingPortalSession: async ({ customerId }) => ({ url: `https://billing.stripe.com/${customerId}` }),
  });

  const ok = await billing.handler(req("POST", {}), {}, portalDeps(CUST));
  assert.equal(JSON.parse(ok.body).url, "https://billing.stripe.com/cus_1");

  const other = { sessionId: "s-5", userId: "cust-2", role: "customer", expiresAt: 4102444800000 };
  const none = await billing.handler(req("POST", {}), {}, portalDeps(other));
  assert.equal(none.statusCode, 404, "someone with no payments has no portal");

  const theirs = await billing.handler(req("POST", { orderId: "o1" }), {}, portalDeps(other));
  assert.equal(theirs.statusCode, 403);
});

/* ============================================================== encoding = */

test("nested Stripe params encode the way Stripe's API expects", () => {
  const out = formEncode({
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 24900, recurring: { interval: "month" } } }],
    metadata: { orderId: "ord-1" },
  }).join("&");

  assert.ok(out.includes("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=24900"), out);
  assert.ok(out.includes("line_items%5B0%5D%5Bprice_data%5D%5Brecurring%5D%5Binterval%5D=month"), out);
  assert.ok(out.includes("metadata%5BorderId%5D=ord-1"), out);
});

test("a product name with an ampersand survives encoding intact", () => {
  const out = formEncode({ product_data: { name: "Router & modem configuration" } }).join("&");
  // An unencoded "&" would truncate the name and silently change the label
  // on the customer's receipt.
  assert.ok(out.includes("Router%20%26%20modem%20configuration"), out);
});


/* ============================================================ setup wiring = */

const WEBHOOK_URL = "https://lit-solutions.tech/.netlify/functions/stripe-webhook";

function setupDeps(session, over = {}) {
  return {
    readCookie: () => "t",
    getSession: async () => session,
    resolveStripe: () => ({
      mode: "test", declaredMode: "test", keyVar: "STRIPE_TEST_KEY", secretVar: "STRIPE_TEST_WEBHOOK_SECRET",
      secretKey: "sk_test_x", webhookSecret: "whsec_t", actualKeyMode: "test", ok: true, problems: [],
      available: { STRIPE_TEST_KEY: true, STRIPE_TEST_WEBHOOK_SECRET: true, STRIPE_SECRET_KEY: false, STRIPE_WEBHOOK_SECRET: false },
    }),
    listWebhookEndpoints: async () => ({ data: [] }),
    createWebhookEndpoint: async ({ url, enabledEvents }) => ({
      id: "we_1", url, enabled_events: enabledEvents, livemode: false, secret: "whsec_generated",
    }),
    deleteWebhookEndpoint: async () => ({ deleted: true }),
    ...over,
  };
}

test("Stripe setup is admin-only, at every method", async () => {
  reset();
  for (const method of ["GET", "POST"]) {
    assert.equal((await stripeSetup.handler(req(method, { action: "create-webhook" }), {}, setupDeps(CUST))).statusCode, 403);
    assert.equal(
      (await stripeSetup.handler(req(method), {}, { readCookie: () => null, getSession: async () => null })).statusCode,
      401);
  }
});

test("the secret key is never returned -- only which mode it belongs to", async () => {
  reset();
  const res = await stripeSetup.handler(req("GET"), {}, setupDeps(ADMIN, {
    resolveStripe: () => resolveStripe({ STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_SECRETVALUE", STRIPE_WEBHOOK_SECRET: "whsec_x" }),
  }));
  const body = JSON.parse(res.body);
  assert.equal(body.keyMode, "live");
  // Nothing key-shaped may appear anywhere in the payload.
  assert.ok(!/sk_(test|live)_/.test(res.body), "a secret key leaked into the response");
});

test("a missing key is reported as a setup step, not an error", async () => {
  reset();
  const res = await stripeSetup.handler(req("GET"), {}, setupDeps(ADMIN, {
    resolveStripe: () => resolveStripe({ STRIPE_MODE: "test" }),
  }));
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.ready, false);
  assert.match(body.advice, /STRIPE_TEST_KEY isn't set/);
  assert.equal(body.keyVar, "STRIPE_TEST_KEY", "it must name the variable for the ACTIVE mode");
});

test("an endpoint pointing elsewhere, or missing events, is not called ready", async () => {
  reset();
  const res = await stripeSetup.handler(req("GET"), {}, setupDeps(ADMIN, {
    listWebhookEndpoints: async () => ({ data: [
      { id: "we_other", url: "https://someone-else.test/hook", enabled_events: ["*"], status: "enabled", livemode: false },
      { id: "we_partial", url: WEBHOOK_URL, enabled_events: ["checkout.session.completed"], status: "enabled", livemode: false },
    ] }),
  }));
  const body = JSON.parse(res.body);
  assert.equal(body.ready, false);

  const other = body.endpoints.find((e) => e.id === "we_other");
  assert.equal(other.urlMatches, false);

  const partial = body.endpoints.find((e) => e.id === "we_partial");
  assert.equal(partial.urlMatches, true);
  assert.equal(partial.healthy, false);
  // The three it doesn't cover must be named, not just counted.
  assert.deepEqual(partial.missingEvents.sort(), [
    "checkout.session.async_payment_failed",
    "checkout.session.async_payment_succeeded",
    "customer.subscription.deleted",
  ]);
});

test("a correct endpoint reads as ready, and a wildcard subscription counts", async () => {
  reset();
  const res = await stripeSetup.handler(req("GET"), {}, setupDeps(ADMIN, {
    listWebhookEndpoints: async () => ({ data: [
      { id: "we_all", url: WEBHOOK_URL, enabled_events: ["*"], status: "enabled", livemode: false },
    ] }),
  }));
  assert.equal(JSON.parse(res.body).ready, true);
});

test("creating an endpoint subscribes to exactly what the handler implements", async () => {
  reset();
  let captured = null;
  const res = await stripeSetup.handler(req("POST", { action: "create-webhook" }), {}, setupDeps(ADMIN, {
    createWebhookEndpoint: async (params) => {
      captured = params;
      return { id: "we_1", url: params.url, enabled_events: params.enabledEvents, livemode: false, secret: "whsec_generated" };
    },
  }));
  const body = JSON.parse(res.body);
  assert.equal(body.created, true);
  assert.equal(captured.url, WEBHOOK_URL, "must point at this site's own function");
  // Drift between what we subscribe to and what stripe-webhook.js handles is
  // the failure this whole endpoint exists to prevent.
  assert.deepEqual(captured.enabledEvents.sort(), stripeSetup.REQUIRED_EVENTS.slice().sort());
  assert.equal(body.signingSecret, "whsec_generated");
  assert.match(body.warning, /only time/i);
});

test("the events we subscribe to are exactly the ones the webhook handles", () => {
  // Read the handler's own source rather than trusting a second list.
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "netlify", "functions", "stripe-webhook.js"), "utf8");
  for (const evt of stripeSetup.REQUIRED_EVENTS) {
    assert.ok(src.includes(`"${evt}"`), `stripe-webhook.js doesn't handle ${evt}, but setup subscribes to it`);
  }
});

test("an already-correct endpoint isn't silently recreated", async () => {
  reset();
  let created = false;
  const res = await stripeSetup.handler(req("POST", { action: "create-webhook" }), {}, setupDeps(ADMIN, {
    listWebhookEndpoints: async () => ({ data: [
      { id: "we_ok", url: WEBHOOK_URL, enabled_events: stripeSetup.REQUIRED_EVENTS, status: "enabled", livemode: false },
    ] }),
    createWebhookEndpoint: async () => { created = true; return {}; },
  }));
  const body = JSON.parse(res.body);
  assert.equal(created, false, "recreating would invalidate a working signing secret");
  assert.equal(body.alreadyCorrect, true);
  assert.match(body.note, /only reveals a signing secret when an endpoint is created/i);
});

test("replacing deletes the old endpoint first, so one URL doesn't get two", async () => {
  reset();
  const deleted = [];
  const res = await stripeSetup.handler(req("POST", { action: "create-webhook", replace: true }), {}, setupDeps(ADMIN, {
    listWebhookEndpoints: async () => ({ data: [
      { id: "we_stale", url: WEBHOOK_URL, enabled_events: ["checkout.session.completed"], status: "enabled", livemode: false },
    ] }),
    deleteWebhookEndpoint: async (id) => { deleted.push(id); return { deleted: true }; },
  }));
  assert.deepEqual(deleted, ["we_stale"]);
  assert.equal(JSON.parse(res.body).created, true);
});

test("a rejected key surfaces as a clear message, not a stack trace", async () => {
  reset();
  const res = await stripeSetup.handler(req("POST", { action: "create-webhook" }), {}, setupDeps(ADMIN, {
    listWebhookEndpoints: async () => { throw new Error("Invalid API Key provided: sk_live_***"); },
  }));
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /rejected the key/i);
});

/* ========================================================= mode resolution = */

const { resolveStripe, requireSecretKey } = require("../netlify/functions/_lib/stripe_config.js");

test("with STRIPE_MODE unset, live is assumed rather than test", () => {
  // The default has to be live. Silently defaulting to test would mean real
  // customers checking out against fake money, with no payment ever arriving
  // and nothing on the site looking wrong.
  const c = resolveStripe({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_l", STRIPE_TEST_KEY: "sk_test_x" });
  assert.equal(c.mode, "live");
  assert.equal(c.keyVar, "STRIPE_SECRET_KEY");
  assert.equal(c.ok, true);
  assert.match(c.problems.join(" "), /STRIPE_MODE isn't set/);
});

test("STRIPE_MODE=test selects the test key AND the test webhook secret together", () => {
  const c = resolveStripe({
    STRIPE_MODE: "test",
    STRIPE_TEST_KEY: "sk_test_x", STRIPE_TEST_WEBHOOK_SECRET: "whsec_t",
    STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_l",
  });
  assert.equal(c.mode, "test");
  assert.equal(c.secretKey, "sk_test_x");
  // The pairing is the point: picking the key from one mode and the signing
  // secret from the other 401s every delivery, and the only symptom is an
  // order stuck on "Waiting on payment".
  assert.equal(c.webhookSecret, "whsec_t");
  assert.equal(c.ok, true);
  assert.deepEqual(c.problems, []);
});

test("a LIVE key sitting in the test slot is refused outright", () => {
  const c = resolveStripe({ STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_live_oops", STRIPE_TEST_WEBHOOK_SECRET: "whsec_t" });
  assert.equal(c.ok, false);
  assert.equal(c.secretKey, "", "a refused key must not be handed out anyway");
  assert.match(c.problems.join(" "), /charging real cards while believing you were testing/i);
  assert.throws(() => requireSecretKey({ STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_live_oops" }), /real cards/i);
});

test("a TEST key sitting in the live slot is refused outright", () => {
  const c = resolveStripe({ STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_oops", STRIPE_WEBHOOK_SECRET: "whsec_l" });
  assert.equal(c.ok, false);
  assert.equal(c.secretKey, "");
  assert.match(c.problems.join(" "), /no payment would arrive/i);
});

test("a missing key names the exact variable to set, for the active mode", () => {
  const test_ = resolveStripe({ STRIPE_MODE: "test" });
  assert.equal(test_.ok, false);
  assert.match(test_.problems.join(" "), /STRIPE_TEST_KEY isn't set/);

  const live = resolveStripe({});
  assert.match(live.problems.join(" "), /STRIPE_SECRET_KEY isn't set/);
});

test("a missing webhook secret is reported without blocking checkout", () => {
  // Checkout can still open; it's confirmation that breaks. Conflating the
  // two would take a working payment path offline over a webhook problem.
  const c = resolveStripe({ STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_test_x" });
  assert.equal(c.ok, true, "checkout must still work");
  assert.equal(c.webhookSecret, "");
  assert.match(c.problems.join(" "), /STRIPE_TEST_WEBHOOK_SECRET isn't set/);
});

test("no key material ever appears in the availability report", () => {
  const c = resolveStripe({
    STRIPE_MODE: "test",
    STRIPE_TEST_KEY: "sk_test_SUPERSECRET", STRIPE_TEST_WEBHOOK_SECRET: "whsec_SUPERSECRET",
    STRIPE_SECRET_KEY: "sk_live_SUPERSECRET", STRIPE_WEBHOOK_SECRET: "whsec_LIVESECRET",
  });
  // `available` is what the admin screen renders, so it must be booleans only.
  assert.deepEqual(c.available, {
    STRIPE_TEST_KEY: true, STRIPE_TEST_WEBHOOK_SECRET: true,
    STRIPE_SECRET_KEY: true, STRIPE_WEBHOOK_SECRET: true,
  });
  assert.ok(!JSON.stringify(c.available).includes("SUPERSECRET"));
});

test("an unrecognised value is refused rather than sent to Stripe as a bearer token", () => {
  const c = resolveStripe({ STRIPE_MODE: "live", STRIPE_SECRET_KEY: "pk_live_wrong_key_type" });
  assert.equal(c.ok, false);
  assert.match(c.problems.join(" "), /doesn't look like a Stripe secret key/i);
});

test("the webhook rejects deliveries when the ACTIVE mode has no secret", async () => {
  reset();
  seedOrder();
  const evt = { type: "checkout.session.completed", data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid" } } };

  // Live secret present, but the site is running in test mode -> the test
  // secret is what matters, and it isn't set.
  const res = await webhook.handler(signed(evt), {}, {
    env: { STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_live_only" },
    now: NOW,
  });
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).error, /STRIPE_TEST_WEBHOOK_SECRET/);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "awaiting_payment", "nothing may change");
});

test("the webhook verifies against the ACTIVE mode's secret, not whichever exists", async () => {
  reset();
  seedOrder();
  const evt = { type: "checkout.session.completed", data: { object: { metadata: { orderId: "ord-test" }, payment_status: "paid", amount_total: 37800 } } };

  // Signed with the TEST secret, running in test mode: accepted.
  const ok = await webhook.handler(signed(evt, { secret: "whsec_test_value" }), {}, {
    env: { STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_test_x", STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_value", STRIPE_WEBHOOK_SECRET: "whsec_live_value" },
    now: NOW,
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "paid");

  // Signed with the LIVE secret while in test mode: rejected, not quietly
  // accepted because "a secret matched something".
  reset();
  seedOrder();
  const bad = await webhook.handler(signed(evt, { secret: "whsec_live_value" }), {}, {
    env: { STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_test_x", STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_value", STRIPE_WEBHOOK_SECRET: "whsec_live_value" },
    now: NOW,
  });
  assert.equal(bad.statusCode, 401);
  assert.equal(blobs.get(k("orders", "ord-test")).status, "awaiting_payment");
});

test("the setup screen reports a mode mismatch instead of talking to Stripe", async () => {
  reset();
  let called = false;
  const res = await stripeSetup.handler(req("GET"), {}, setupDeps(ADMIN, {
    resolveStripe: () => resolveStripe({ STRIPE_MODE: "test", STRIPE_TEST_KEY: "sk_live_oops" }),
    listWebhookEndpoints: async () => { called = true; return { data: [] }; },
  }));
  const body = JSON.parse(res.body);
  assert.equal(called, false, "a refused key must not be sent to Stripe");
  assert.equal(body.ready, false);
  assert.equal(body.keyMode, "mismatch");
  assert.equal(body.keyVar, "STRIPE_TEST_KEY");
  assert.match(body.advice, /real cards/i);
});


/* ============================================== the session-shape outage = */

test("a session carries no email, and checkout resolves the address by id", async () => {
  reset();
  seedUser(CUST, null);
  // The exact production shape: no `email` anywhere on the session.
  assert.equal(CUST.email, undefined, "test doubles must match auth_utils.createSession");

  const res = await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {}, deps(CUST));
  assert.equal(res.statusCode, 200);

  const order = blobs.get(k("orders", "ord-test"));
  // Before the fix this was null, so the paid-confirmation email and the
  // admin notification both had nowhere to go.
  assert.equal(order.customerEmail, CUST_EMAIL);
  assert.equal(lastSessionParams.customerEmail, CUST_EMAIL);
});

test("hero-status resolves its own account by id too", async () => {
  reset();
  seedUser(CUST, null);
  const res = await heroStatus.handler(req("POST", { category: "Veteran" }), {}, deps(CUST));
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(blobs.get(k("users", CUST_EMAIL)).heroStatus.state, "pending");
  // The customer's acknowledgement has to reach a real address.
  assert.ok(sent.find((m) => m.to === CUST_EMAIL), "the customer should have been emailed");
});

test("an empty blob key is refused immediately instead of hanging", () => {
  const { assertKey } = require("../netlify/functions/_lib/blob_store.js");
  // Netlify Blobs turns an empty key into an undefined URL, retries with
  // backoff, and times out ~25s later with an error that names neither the
  // store nor the key. That cost a live outage; fail fast and say where.
  for (const bad of ["", "   ", undefined, null, 0, {}]) {
    assert.throws(() => assertKey("users", bad), /empty key on the "users" store/,
      `accepted ${JSON.stringify(bad)}`);
  }
  assert.equal(assertKey("users", "jane@example.test"), "jane@example.test");
});

/* ================================================================= tax codes = */

test("every Stripe line item carries a tax code", () => {
  // Managed Payments rejects a session outright if any product's tax
  // treatment is undeterminable: "Invalid line_items[0]: the product tax code
  // is missing". That took the whole checkout down, so assert it for every
  // product under every pricing combination rather than spot-checking.
  for (const product of listProducts()) {
    for (const hero of [false, true]) {
      for (const payInFull of [false, true]) {
        const priced = priceCart([{ product, quantity: 1 }], { hero, payInFull });
        for (const line of toStripeLineItems(priced)) {
          const code = line.price_data.product_data.tax_code;
          assert.match(String(code), /^txcd_\d+$/,
            `${product.key} hero=${hero} full=${payInFull}: bad tax_code ${JSON.stringify(code)}`);
        }
      }
    }
  }
});

test("a plan codes its build labour and its hosting separately", () => {
  // The deposit buys design and build (a professional service); the monthly
  // fee buys hosting. Forcing both into one bucket would misreport tax on
  // one of them.
  const priced = priceCart([{ product: getProduct("plan-standard"), quantity: 1 }], {});
  const lines = toStripeLineItems(priced);
  const oneOff = lines.find((l) => !l.price_data.recurring);
  const monthly = lines.find((l) => l.price_data.recurring);

  assert.equal(oneOff.price_data.product_data.tax_code, "txcd_20060000", "deposit = professional services");
  assert.equal(monthly.price_data.product_data.tax_code, "txcd_10701100", "monthly = website hosting");
  assert.notEqual(oneOff.price_data.product_data.tax_code, monthly.price_data.product_data.tax_code);
});

test("a product added without a tax code still gets a sane one", () => {
  const { taxCodeFor, monthlyTaxCodeFor, TAX } = require("../netlify/functions/_lib/product_catalog.js");
  // A missing code must never reach Stripe as undefined -- that is a 400 and
  // a dead checkout, not a degraded one.
  assert.equal(taxCodeFor({ key: "new-thing" }), TAX.PROFESSIONAL);
  assert.equal(monthlyTaxCodeFor({ key: "new-thing" }), TAX.PROFESSIONAL);
  // A one-time code with no recurring override applies to both.
  assert.equal(monthlyTaxCodeFor({ taxCode: TAX.HOSTING }), TAX.HOSTING);
});

test("Managed Payments is switched off on every session", async () => {
  reset();
  seedUser(CUST, null);
  let sent = null;
  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {},
    deps(CUST, {
      createCheckoutSession: async (params) => {
        // Assert on what actually reaches Stripe's API, not on our own wrapper.
        const { createCheckoutSession: real } = require("../netlify/functions/_lib/stripe_api.js");
        sent = params;
        return { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" };
      },
    }));
  // The wrapper adds it, so verify through formEncode on a representative call.
  const { formEncode } = require("../netlify/functions/_lib/stripe_api.js");
  const encoded = formEncode({ managed_payments: { enabled: false } }).join("&");
  assert.ok(encoded.includes("managed_payments%5Benabled%5D=false"));
  assert.ok(sent, "a session should have been requested");
});

test("the wrapper disables Managed Payments unless explicitly asked for", async () => {
  // Stripe enables it by default on new accounts, and it is restricted to
  // digital products -- "professional services (consulting, marketing,
  // design, development, tech support)" are ineligible, which is nearly
  // everything sold here. Leaving it on rejects every session AND would add
  // 3.5% per transaction.
  const captured = [];
  const Module = require("node:module");
  const stripeApi = require("../netlify/functions/_lib/stripe_api.js");
  const origFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured.push(String(init && init.body));
    return { ok: true, json: async () => ({ id: "cs_1", url: "https://x.test" }) };
  };
  const origKey = process.env.STRIPE_SECRET_KEY;
  const origMode = process.env.STRIPE_MODE;
  process.env.STRIPE_MODE = "live";
  process.env.STRIPE_SECRET_KEY = "sk_live_fake_for_encoding_only";
  try {
    await stripeApi.createCheckoutSession({
      mode: "payment", lineItems: [], successUrl: "https://x.test/s", cancelUrl: "https://x.test/c",
    });
    assert.ok(captured[0].includes("managed_payments%5Benabled%5D=false"), captured[0]);
  } finally {
    global.fetch = origFetch;
    if (origKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = origKey;
    if (origMode === undefined) delete process.env.STRIPE_MODE; else process.env.STRIPE_MODE = origMode;
  }
});

/* ========================================== one order per cart, not per try = */

test("a retried checkout reuses the same order instead of stacking dead ones", async () => {
  reset();
  seedUser(CUST, null);
  const cart = { items: [{ key: "svc-seo", quantity: 1 }] };

  // First attempt fails the way a declined card or a bad config would.
  await checkout.handler(req("POST", cart), {}, deps(CUST, {
    idGenerator: () => "ord-1",
    createCheckoutSession: async () => { throw new Error("boom"); },
  }));
  assert.equal(blobs.get(k("orders", "ord-1")).status, "checkout_failed");

  // Second attempt with the SAME cart must not create a second order.
  await checkout.handler(req("POST", cart), {}, deps(CUST, { idGenerator: () => "ord-2" }));

  const orderIds = [...blobs.keys()].filter((x) => x.startsWith("orders::")).map((x) => x.slice(8));
  assert.deepEqual(orderIds, ["ord-1"], `expected one order, got ${orderIds.join(", ")}`);
  assert.equal(blobs.get(k("orders", "ord-1")).status, "awaiting_payment");
});

test("checking out a different cart retires the abandoned one", async () => {
  reset();
  seedUser(CUST, null);
  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {},
    deps(CUST, { idGenerator: () => "ord-old" }));

  // Customer changes their mind and buys something else entirely.
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {},
    deps(CUST, { idGenerator: () => "ord-new" }));

  assert.equal(blobs.get(k("orders", "ord-old")).status, "superseded",
    "the abandoned cart shouldn't keep sitting on the dashboard");
  assert.equal(blobs.get(k("orders", "ord-new")).status, "awaiting_payment");
});

test("a paid order is never reused, superseded, or otherwise disturbed", async () => {
  reset();
  seedUser(CUST, null);
  // A completed purchase, exactly as the webhook leaves it.
  blobs.set(k("orders", "ord-paid"), {
    id: "ord-paid", customerId: CUST.userId, customerEmail: CUST_EMAIL,
    items: [{ key: "svc-seo", name: "Basic SEO optimization", quantity: 1 }],
    status: "paid", provider: "stripe", createdAt: "2026-08-01T00:00:00.000Z",
    cartSignature: "svc-seo:1|full=0",
  });

  // Same cart again -- a repeat purchase, which must be a NEW order.
  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {},
    deps(CUST, { idGenerator: () => "ord-fresh" }));

  assert.equal(blobs.get(k("orders", "ord-paid")).status, "paid", "a paid order must never be touched");
  assert.equal(blobs.get(k("orders", "ord-fresh")).status, "awaiting_payment");
});

test("one customer's abandoned orders never touch another's", async () => {
  reset();
  seedUser(CUST, null);
  const other = { sessionId: "s-9", userId: "cust-99", role: "customer", expiresAt: 4102444800000 };
  seedUser(other, null, "other@example.test");

  await checkout.handler(req("POST", { items: [{ key: "svc-seo", quantity: 1 }] }), {},
    deps(CUST, { idGenerator: () => "ord-mine" }));
  await checkout.handler(req("POST", { items: [{ key: "plan-premium", quantity: 1 }] }), {},
    deps(other, { idGenerator: () => "ord-theirs" }));

  assert.equal(blobs.get(k("orders", "ord-mine")).status, "awaiting_payment",
    "another customer's checkout must not supersede mine");
});
