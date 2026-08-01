/* Deep integration pass over the purchase flow.
 *
 * Distinct from test/orders-and-brief.test.js, which covers each handler's
 * happy path and permissions. This drives the REAL handlers end to end
 * against an in-memory store and goes looking for trouble: every transition
 * in the state machine including the illegal ones, injection through every
 * customer-controlled string, what the PDF actually contains rather than
 * merely that it is a PDF, and what happens when the mailer fails.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const zlib = require("node:zlib");

const NOW = () => new Date("2026-08-01T12:00:00.000Z");

const blobs = new Map();
const sent = [];
let mailShouldThrow = false;

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
const stubEmail = {
  sendEmail: async (m) => {
    if (mailShouldThrow) throw new Error("Resend is down");
    sent.push(clone(m));
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  // Match both "./_lib/blob_store" (from a function) and "./blob_store"
  // (from inside _lib itself) -- the first version of this only caught the
  // former, so verification.js quietly reached for real Netlify Blobs.
  if (/(^|\/)blob_store$/.test(request)) return stubBlob;
  if (/(^|\/)email$/.test(request)) return stubEmail;
  if (/(^|\/)auth_utils$/.test(request)) {
    return { ...origLoad.call(this, request, parent, isMain), rateLimited: async () => false };
  }
  return origLoad.call(this, request, parent, isMain);
};
const orders = require("../netlify/functions/orders.js");
const brief = require("../netlify/functions/project-brief.js");
const verification = require("../netlify/functions/_lib/verification.js");
const { renderBriefPdf } = require("../netlify/functions/_lib/brief_pdf.js");
const { getProduct, listProducts } = require("../netlify/functions/_lib/product_catalog.js");
const { priceCart, toStripeLineItems } = require("../netlify/functions/_lib/pricing.js");
Module._load = origLoad;

function reset() { blobs.clear(); sent.length = 0; mailShouldThrow = false; }

const CUST = { userId: "cust-1", email: "jane@example.test", role: "customer" };
const ADMIN = { userId: "admin-1", email: "dylan@lit-solutions.tech", role: "admin" };
const deps = (session, extra = {}) => ({ readCookie: () => "t", getSession: async () => session, now: NOW, ...extra });
const req = (method, body, qs) => ({ httpMethod: method, body: body ? JSON.stringify(body) : undefined, queryStringParameters: qs || null, headers: {} });

const ANSWERS = {
  businessName: "Riverside Plumbing",
  contactName: "Jane Doe",
  businessDescription: "Emergency and scheduled plumbing across the Northern Neck.",
  services: "Repairs, installs, emergency callouts",
};

/* checkout.js is the only thing that creates orders now (it has to be -- the
 * order id travels in the Stripe session metadata). So these tests seed the
 * store with exactly the record checkout.js writes, rather than going through
 * a POST route that deliberately no longer exists. */
let orderSeq = 0;
async function newOrder(planKey = "plan-premium", opts = {}) {
  const product = getProduct(planKey);
  const items = [{ product, quantity: 1 }];
  const priced = priceCart(items, { hero: !!opts.hero, payInFull: !!opts.payInFull });
  const id = opts.id || `ord-${++orderSeq}`;
  blobs.set(k("orders", id), {
    id,
    customerId: (opts.session || CUST).userId,
    customerEmail: (opts.session || CUST).email,
    items: [{ key: product.key, name: product.name, quantity: 1 }],
    pricing: priced,
    hero: !!opts.hero,
    payInFull: !!opts.payInFull,
    status: opts.status || "awaiting_payment",
    provider: "stripe",
    createdAt: NOW().toISOString(),
  });
  const r = await orders.handler(req("GET"), {}, deps(opts.session || CUST));
  return JSON.parse(r.body).orders.find((o) => o.id === id);
}
/** Push an order to paid the way the Stripe webhook does. */
async function markPaid(id) {
  const o = blobs.get(k("orders", id));
  o.status = "paid";
  o.paidAt = NOW().toISOString();
  blobs.set(k("orders", id), o);
}
async function statusOf(id) {
  const r = await orders.handler(req("GET"), {}, deps(CUST));
  return (JSON.parse(r.body).orders.find((o) => o.id === id) || {}).status;
}

/* ------------------------------------------------- catalog consistency --- */

test("every product in the catalog is complete and internally consistent", () => {
  const products = listProducts();
  assert.equal(products.length, 11, `catalog is ${products.length} products`);
  // Owner's rule: website work is fixed-rate and payable on the site; IT work
  // is quoted and invoiced. Nothing IT-side may become checkout-able by
  // accident, because that would take money for a job nobody has scoped.
  const itCategories = ["Cybersecurity", "Networking", "Small business IT", "Computer repair"];
  for (const p of products) {
    assert.ok(!itCategories.includes(p.category), `${p.key} is IT work and must not be in the cart`);
  }
  const seenKeys = new Set();
  for (const p of products) {
    for (const field of ["key", "kind", "category", "name", "summary"]) {
      assert.ok(p[field], `${p.key} missing ${field}`);
    }
    assert.ok(!seenKeys.has(p.key), `duplicate product key ${p.key}`);
    seenKeys.add(p.key);
    assert.ok(["plan", "package", "subscription", "service"].includes(p.kind), `${p.key} bad kind`);

    // Every kind must carry the amount its kind is priced from, or the
    // pricing engine silently charges zero.
    if (p.kind === "plan") { assert.ok(p.depositCents > 0); assert.ok(p.monthlyCents > 0); }
    if (p.kind === "package") assert.ok(p.totalCents > 0);
    if (p.kind === "subscription") assert.ok(p.monthlyCents > 0);
    if (p.kind === "service") assert.ok(p.amountCents > 0);
  }
});

test("a product never prices to zero, so no cart line can be free by accident", () => {
  for (const p of listProducts()) {
    const priced = priceCart([{ product: p, quantity: 1 }], {});
    assert.ok(priced.chargedTodayCents > 0, `${p.key} charges nothing today`);
  }
});

test("the generated browser catalog agrees with the server, price for price", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "js", "product-catalog.js"), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const client = sandbox.window.LTS_PRODUCTS.PRODUCTS;
  const server = listProducts();

  assert.equal(client.length, server.length, "different number of products -- rebuild js/product-catalog.js");
  for (const p of server) {
    const c = client.find((x) => x.key === p.key);
    assert.ok(c, `client catalog missing ${p.key} -- rebuild js/product-catalog.js`);
    assert.equal(c.name, p.name);

    // The figure on the card must be the figure checkout would quote. This is
    // the assertion that stops a stale generated file quoting an old price.
    const list = priceCart([{ product: p, quantity: 1 }], {});
    const hero = priceCart([{ product: p, quantity: 1 }], { hero: true });
    assert.equal(c.chargedTodayCents, list.chargedTodayCents, `${p.key} today differs`);
    assert.equal(c.monthlyCents, list.monthlyCents, `${p.key} monthly differs`);
    assert.equal(c.heroChargedTodayCents, hero.chargedTodayCents, `${p.key} hero today differs`);
    assert.equal(c.heroMonthlyCents, hero.monthlyCents, `${p.key} hero monthly differs`);
  }
});

test("what the cart shows is exactly what the Stripe line items add up to", () => {
  // Every combination of hero and pay-in-full, over a representative cart.
  const carts = [
    ["plan-premium"], ["plan-standard"], ["package-business"], ["care-plan"],
    ["svc-seo", "svc-domain-setup"], ["plan-executive", "care-plan"], ["package-starter", "svc-seo"],
  ];
  for (const keys of carts) {
    for (const hero of [false, true]) {
      for (const payInFull of [false, true]) {
        const items = keys.map((key) => ({ product: getProduct(key), quantity: 1 }));
        const priced = priceCart(items, { hero, payInFull });
        const total = toStripeLineItems(priced).reduce((sum, l) => sum + l.price_data.unit_amount, 0);
        assert.equal(total, priced.chargedTodayCents,
          `${keys.join("+")} hero=${hero} full=${payInFull}: cart says ${priced.chargedTodayCents}, Stripe would take ${total}`);
      }
    }
  }
});

test("a monthly subscription is billed once, not twice, in its first month", () => {
  // The regression that mattered: a $39 plan emitting BOTH a "first month"
  // one-off AND a recurring line, taking $78.
  const priced = priceCart([{ product: getProduct("care-plan"), quantity: 1 }], {});
  const lines = toStripeLineItems(priced);
  assert.equal(lines.length, 1, `expected one line, got ${lines.length}`);
  assert.ok(lines[0].price_data.recurring, "the single line must be the recurring one");
  assert.equal(priced.chargedTodayCents, 3900);
});

test("the Heroes rate follows the component: 15% one-time, 5% recurring", () => {
  const priced = priceCart([{ product: getProduct("plan-premium"), quantity: 1 }], { hero: true });
  const line = priced.lines[0];
  assert.equal(line.oneOffCents, Math.round(24900 * 0.85), "deposit is one-time work -- 15%");
  assert.equal(line.monthlyCents, Math.round(12900 * 0.95), "the monthly fee is recurring -- 5%");
});

test("a website build splits 50/50 unless paid in full, and never loses the balance", () => {
  const half = priceCart([{ product: getProduct("package-business"), quantity: 1 }], {});
  assert.equal(half.chargedTodayCents + half.balanceAtLaunchCents, 129900);
  assert.ok(half.chargedTodayCents >= half.balanceAtLaunchCents, "the balance must never be the larger half");

  const full = priceCart([{ product: getProduct("package-business"), quantity: 1 }], { payInFull: true });
  assert.equal(full.chargedTodayCents, 129900);
  assert.equal(full.balanceAtLaunchCents, 0);
});

/* --------------------------------------------------- order state machine -- */

test("every illegal transition is refused, and the order is left untouched", async () => {
  reset();
  const o = await newOrder();

  // A customer must never be able to reach `paid` themselves. With Square
  // there was a "report-payment" middle state that let them claim it; Stripe
  // confirms directly, so the claim route is gone and this is the only path.
  assert.equal((await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(CUST))).statusCode, 403);
  assert.equal(await statusOf(o.id), "awaiting_payment");

  assert.equal((await orders.handler(req("PATCH", { id: o.id, action: "delete" }), {}, deps(ADMIN))).statusCode, 400);
  assert.equal((await orders.handler(req("PATCH", { id: "nope", action: "cancel" }), {}, deps(CUST))).statusCode, 404);
  assert.equal(await statusOf(o.id), "awaiting_payment");
});

test("orders can no longer be created through the API -- only at checkout", async () => {
  reset();
  // The order id has to exist BEFORE the Stripe session so it can ride in
  // the metadata. An order minted anywhere else is one nothing can pay for.
  const r = await orders.handler(req("POST", { planKey: "plan-premium" }), {}, deps(CUST));
  assert.equal(r.statusCode, 410);
  assert.match(JSON.parse(r.body).error, /checkout/i);
  const list = JSON.parse((await orders.handler(req("GET"), {}, deps(CUST))).body).orders;
  assert.equal(list.length, 0, "a rejected POST must not leave an order behind");
});

test("a customer can cancel an unpaid order but not a paid one", async () => {
  reset();
  const unpaid = await newOrder("plan-standard");
  const r1 = await orders.handler(req("PATCH", { id: unpaid.id, action: "cancel" }), {}, deps(CUST));
  assert.equal(r1.statusCode, 200);
  assert.equal(await statusOf(unpaid.id), "cancelled");

  const paid = await newOrder("plan-premium");
  await markPaid(paid.id);
  const r2 = await orders.handler(req("PATCH", { id: paid.id, action: "cancel" }), {}, deps(CUST));
  assert.equal(r2.statusCode, 400, "a paid order must not be self-cancellable");
  assert.equal(await statusOf(paid.id), "paid");
});

test("cancelling someone else's order is refused", async () => {
  reset();
  const o = await newOrder();
  const res = await orders.handler(req("PATCH", { id: o.id, action: "cancel" }), {},
    deps({ userId: "other", email: "o@x.test", role: "customer" }));
  assert.equal(res.statusCode, 403);
  assert.equal(await statusOf(o.id), "awaiting_payment");
});

test("a submitted order is terminal -- confirming payment afterwards can't undo it", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  await brief.handler(req("POST", { orderId: o.id, answers: ANSWERS }), {}, deps(CUST));
  assert.equal(await statusOf(o.id), "brief_submitted");
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  assert.equal(await statusOf(o.id), "brief_submitted", "must not fall back to paid");
});

test("a customer can hold several orders at once without them colliding", async () => {
  reset();
  // Square's one-paid-phase limit forced a one-open-order-at-a-time rule.
  // With Stripe a customer can buy a website in one checkout and a support
  // plan in another, and both must survive independently.
  const a = await newOrder("plan-standard", { id: "ord-a" });
  const b = await newOrder("care-plan", { id: "ord-b" });
  await markPaid(a.id);

  const list = JSON.parse((await orders.handler(req("GET"), {}, deps(CUST))).body).orders;
  assert.equal(list.length, 2);
  assert.equal(list.find((o) => o.id === "ord-a").status, "paid");
  assert.equal(list.find((o) => o.id === "ord-b").status, "awaiting_payment");
});

test("an order reports what is actually in it, including whether it needs a brief", async () => {
  reset();
  const build = await newOrder("plan-premium", { id: "ord-build" });
  assert.equal(build.needsBrief, true, "a website build needs a brief");
  assert.equal(build.summary, "Premium");
  assert.equal(build.chargedTodayCents, 37800, "deposit plus the first month");
  assert.equal(build.monthlyCents, 12900);

  const services = await newOrder("svc-seo", { id: "ord-svc" });
  assert.equal(services.needsBrief, false, "a one-off service has nothing to brief");
});

test("a Square-era order still renders on the dashboard after the migration", async () => {
  reset();
  // Written by the old flow: a planKey, no items, no pricing. It must not
  // crash the list or come back blank.
  blobs.set(k("orders", "legacy-1"), {
    id: "legacy-1", customerId: CUST.userId, customerEmail: CUST.email,
    planKey: "premium", planName: "Premium", status: "paid",
    depositLink: "https://square.link/u/GaFznrtG",
    createdAt: NOW().toISOString(), paidAt: NOW().toISOString(),
  });
  const list = JSON.parse((await orders.handler(req("GET"), {}, deps(CUST))).body).orders;
  assert.equal(list.length, 1);
  assert.equal(list[0].provider, "square");
  assert.equal(list[0].summary, "Premium");
  assert.equal(list[0].needsBrief, true);
  assert.equal(list[0].depositLink, "https://square.link/u/GaFznrtG", "an in-flight legacy order must stay completable");
});

/* ------------------------------------------------------------ injection -- */

test("HTML in a customer's answers cannot escape into the admin email", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  sent.length = 0;

  const nasty = '<script>alert(1)</script><img src=x onerror="steal()">';
  await brief.handler(req("POST", {
    orderId: o.id,
    answers: { ...ANSWERS, businessName: nasty, anythingElse: '"><b>bold</b>' },
  }), {}, deps(CUST));

  const admin = sent.find((m) => m.to === "dylan@lit-solutions.tech");
  assert.ok(admin);

  // What matters is that no LIVE markup reaches the body. The literal text
  // "onerror=" surviving is fine and expected -- with its "<" escaped it
  // renders as visible characters, not an attribute. So assert on real tags
  // rather than on scary-looking substrings.
  const liveTags = admin.html.match(/<\s*(script|img|iframe|svg|object|embed)\b/gi) || [];
  assert.deepEqual(liveTags, [], `live markup in the email body: ${liveTags.join(", ")}`);
  assert.ok(admin.html.includes("&lt;script&gt;"), "the value should appear escaped, not dropped");
  assert.ok(admin.html.includes("&lt;img"), "the img tag should be escaped, not stripped");

  // And the same value must be inert in the customer's copy and the PDF.
  const cust = sent.find((m) => m.to === "jane@example.test");
  assert.deepEqual(cust.html.match(/<\s*(script|img|iframe)\b/gi) || [], []);
});

test("an email address with HTML in it is escaped in the brief notification", async () => {
  reset();
  const nasty = { ...CUST, email: '<b>x</b>@y.test' };
  const o = await newOrder("plan-premium", { session: nasty });
  await markPaid(o.id);
  await brief.handler(req("POST", { orderId: o.id, answers: ANSWERS }), {}, deps(nasty));
  const m = sent.find((x) => x.to === "dylan@lit-solutions.tech");
  assert.ok(m, "the admin should have been notified");
  assert.ok(!m.html.includes("<b>x</b>@"), "unescaped email in notification");
  assert.ok(m.html.includes("&lt;b&gt;"));
});

test("over-long answers are truncated rather than accepted whole", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  await brief.handler(req("POST", { orderId: o.id, answers: { ...ANSWERS, anythingElse: "x".repeat(50000) } }), {}, deps(CUST));
  const stored = blobs.get(k("orders", o.id));
  assert.ok(stored.briefAnswers.anythingElse.length <= 4000, "field cap not applied");
});

test("unknown keys in the answers payload are discarded, not stored", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  await brief.handler(req("POST", { orderId: o.id, answers: { ...ANSWERS, __proto__: { polluted: true }, evilKey: "x" } }), {}, deps(CUST));
  const stored = blobs.get(k("orders", o.id));
  assert.equal(stored.briefAnswers.evilKey, undefined, "unexpected key was persisted");
  assert.equal({}.polluted, undefined, "prototype pollution");
});

/* ------------------------------------------------------------------ pdf -- */

function pdfText(buf) {
  // Pull readable text out of the PDF's content streams so we can assert on
  // what a human would actually see, not just that bytes exist.
  let out = "";
  const s = buf.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(s))) {
    const raw = Buffer.from(m[1], "latin1");
    let text = raw;
    try { text = zlib.inflateSync(raw); } catch { /* uncompressed */ }
    out += text.toString("latin1");
  }
  return out;
}

test("the PDF actually contains the submitted answers and the plan", () => {
  const out = renderBriefPdf({
    order: { id: "ord-abc", planKey: "premium", planName: "Premium" },
    answers: { ...ANSWERS },
    customer: { email: "jane@example.test" },
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  const buf = Buffer.from(out.base64, "base64");
  const text = pdfText(buf);
  for (const needle of ["Website Project Brief", "Riverside Plumbing", "Jane Doe", "Premium", "ord-abc"]) {
    assert.ok(text.includes(needle), `PDF is missing "${needle}"`);
  }
});

test("a very long answer paginates instead of running off the page", () => {
  const out = renderBriefPdf({
    order: { id: "o", planKey: "premium", planName: "Premium" },
    answers: { businessName: "X", businessDescription: "word ".repeat(4000) },
    customer: { email: "a@b.test" },
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  const buf = Buffer.from(out.base64, "base64");
  const pageCount = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pageCount > 1, `expected multiple pages, got ${pageCount}`);
  assert.ok(pdfText(buf).includes("Page 1 of"), "page numbering missing");
});

test("the PDF renders with every field empty rather than throwing", () => {
  const out = renderBriefPdf({
    order: { id: "o", planKey: "standard", planName: "Standard" },
    answers: {},
    customer: {},
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(Buffer.from(out.base64, "base64").slice(0, 5).toString(), "%PDF-");
  assert.equal(out.filename, "project-brief-brief.pdf");
});

test("unicode in a business name survives to the filename safely", () => {
  const out = renderBriefPdf({
    order: { id: "o", planKey: "standard", planName: "Standard" },
    answers: { businessName: "Café Málaga 🍕" },
    customer: { email: "a@b.test" },
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.match(out.filename, /^project-brief-[A-Za-z0-9-]+\.pdf$/);
  assert.ok(!/[^\x20-\x7e]/.test(out.filename), "non-ascii leaked into the filename");
});

/* -------------------------------------------------------- failure modes -- */

test("a mailer outage does not lose the brief", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(ADMIN));
  mailShouldThrow = true;
  await assert.rejects(() => brief.handler(req("POST", { orderId: o.id, answers: ANSWERS }), {}, deps(CUST)));
  mailShouldThrow = false;

  // The document copy is written before the emails, so the customer's
  // submission survives an outage and a retry can go through.
  const docKey = [...blobs.keys()].find((x) => x.startsWith("documents::"));
  assert.ok(docKey, "the Documents copy should already be saved");
  const retry = await brief.handler(req("POST", { orderId: o.id, answers: ANSWERS }), {}, deps(CUST));
  assert.equal(retry.statusCode, 200, "a retry after an outage must succeed");
  assert.equal(await statusOf(o.id), "brief_submitted");
});

test("a GET for a brief on someone else's order is refused before any work", async () => {
  reset();
  const o = await newOrder();
  const res = await brief.handler(req("GET", null, { orderId: o.id }), {}, deps({ userId: "other", email: "o@x.test", role: "customer" }));
  assert.equal(res.statusCode, 403);
});

test("an admin can read a customer's brief without owning the order", async () => {
  reset();
  const o = await newOrder();
  const res = await brief.handler(req("GET", null, { orderId: o.id }), {}, deps(ADMIN));
  assert.equal(res.statusCode, 200);
});

/* ------------------------------------------------- verification codes ---- */

test("a code verifies once and cannot be replayed", async () => {
  reset();
  const user = { id: "u1", email: "a@b.test", name: "A" };
  const code = await verification.issueCode(user, { now: NOW });
  assert.match(code, /^\d{6}$/);
  assert.equal((await verification.checkCode(user.id, code, { now: NOW })).ok, true);
  assert.equal((await verification.checkCode(user.id, code, { now: NOW })).ok, false, "replay accepted");
});

test("the code is never stored in readable form", async () => {
  reset();
  const user = { id: "u2", email: "a@b.test", name: "A" };
  const code = await verification.issueCode(user, { now: NOW });
  const rec = blobs.get(k("tokens", `verify-code:${user.id}`));
  assert.equal(rec.code, undefined);
  assert.ok(!JSON.stringify(rec).includes(code), "the plain code is recoverable from storage");
  assert.match(rec.codeHash, /^[a-f0-9]{64}$/);
});

test("codes expire", async () => {
  reset();
  const user = { id: "u3", email: "a@b.test", name: "A" };
  const code = await verification.issueCode(user, { now: NOW });
  const later = () => new Date(NOW().getTime() + 31 * 60 * 1000);
  const r = await verification.checkCode(user.id, code, { now: later });
  assert.equal(r.ok, false);
  assert.match(r.reason, /expired/i);
});

test("guessing is bounded, and the lockout survives a correct guess afterwards", async () => {
  reset();
  const user = { id: "u4", email: "a@b.test", name: "A" };
  const code = await verification.issueCode(user, { now: NOW });
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < verification.MAX_CODE_ATTEMPTS; i++) {
    await verification.checkCode(user.id, wrong, { now: NOW });
  }
  const r = await verification.checkCode(user.id, code, { now: NOW });
  assert.equal(r.ok, false, "lockout must hold even for the right code");
  assert.match(r.reason, /Too many/i);
});

test("issuing a new code invalidates the previous one", async () => {
  reset();
  const user = { id: "u5", email: "a@b.test", name: "A" };
  const first = await verification.issueCode(user, { now: NOW });
  const second = await verification.issueCode(user, { now: NOW });
  assert.notEqual(first, second);
  assert.equal((await verification.checkCode(user.id, first, { now: NOW })).ok, false, "the old code still works");
  assert.equal((await verification.checkCode(user.id, second, { now: NOW })).ok, true);
});

test("codes are drawn from the full six-digit range, including leading zeros", () => {
  const seen = new Set();
  let leadingZero = false;
  for (let i = 0; i < 3000; i++) {
    const c = verification.generateCode();
    assert.match(c, /^\d{6}$/);
    if (c[0] === "0") leadingZero = true;
    seen.add(c);
  }
  assert.ok(leadingZero, "leading-zero codes are never produced -- range is truncated");
  assert.ok(seen.size > 2800, `poor spread: only ${seen.size} distinct in 3000`);
});

test("a malformed code submission fails closed rather than throwing", async () => {
  reset();
  const user = { id: "u6", email: "a@b.test", name: "A" };
  await verification.issueCode(user, { now: NOW });
  for (const bad of [undefined, null, "", "abc", "12345678", 123456, {}, []]) {
    const r = await verification.checkCode(user.id, bad, { now: NOW });
    assert.equal(r.ok, false, `accepted ${JSON.stringify(bad)}`);
  }
});

test("checking a code for an unknown user fails closed", async () => {
  reset();
  const r = await verification.checkCode("nobody", "123456", { now: NOW });
  assert.equal(r.ok, false);
});
