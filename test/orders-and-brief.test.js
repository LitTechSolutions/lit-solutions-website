const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const NOW = () => new Date("2026-08-01T12:00:00.000Z");

/* ------------------------------------------------------------------------
 * These two functions reach for Netlify Blobs and Resend at module scope, so
 * the store and the mailer are stubbed by intercepting the shared _lib
 * requires. Cleaner than threading a dozen deps through every call site, and
 * it exercises the real handler code path.
 * --------------------------------------------------------------------- */
const blobs = new Map();
const sent = [];

function key(store, k) { return `${store}::${k}`; }

const origResolve = Module._resolveFilename;
const stubs = {
  blob_store: {
    getJSON: async (s, k) => (blobs.has(key(s, k)) ? JSON.parse(JSON.stringify(blobs.get(key(s, k)))) : null),
    setJSON: async (s, k, v) => { blobs.set(key(s, k), JSON.parse(JSON.stringify(v))); },
    deleteKey: async (s, k) => { blobs.delete(key(s, k)); },
    store: (s) => ({
      list: async () => ({ blobs: [...blobs.keys()].filter((x) => x.startsWith(s + "::")).map((x) => ({ key: x.slice(s.length + 2) })) }),
      get: async (k) => (blobs.has(key(s, k)) ? JSON.parse(JSON.stringify(blobs.get(key(s, k)))) : null),
    }),
  },
  email: { sendEmail: async (m) => { sent.push(m); } },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("_lib/blob_store")) return stubs.blob_store;
  if (request.endsWith("_lib/email")) return stubs.email;
  if (request.endsWith("_lib/auth_utils")) {
    const real = origLoad.call(this, request, parent, isMain);
    return { ...real, rateLimited: async () => false };
  }
  return origLoad.call(this, request, parent, isMain);
};

const orders = require("../netlify/functions/orders.js");
const brief = require("../netlify/functions/project-brief.js");
const { renderBriefPdf, BRIEF_FIELDS } = require("../netlify/functions/_lib/brief_pdf.js");

Module._load = origLoad;
Module._resolveFilename = origResolve;

function reset() { blobs.clear(); sent.length = 0; }

const CUSTOMER = { userId: "cust-1", email: "jane@example.test", role: "customer" };
const ADMIN = { userId: "admin-1", email: "dylan@lit-solutions.tech", role: "admin" };

const deps = (session) => ({
  readCookie: () => "tok",
  getSession: async () => session,
  now: NOW,
  idGenerator: () => "order-1",
});

const req = (method, body, qs) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : undefined,
  queryStringParameters: qs || null,
  headers: {},
});

/* checkout.js creates orders now (it must -- the order id has to exist before
 * the Stripe session so it can travel in the metadata). These tests seed the
 * store with the record it writes. */
const { getProduct } = require("../netlify/functions/_lib/product_catalog.js");
const { priceCart } = require("../netlify/functions/_lib/pricing.js");

let seedSeq = 0;
function seedOrder(opts = {}) {
  const product = getProduct(opts.key || "plan-premium");
  const priced = priceCart([{ product, quantity: 1 }], {});
  const session = opts.session || CUSTOMER;
  const id = opts.id || `order-${++seedSeq}`;
  blobs.set(key("orders", id), {
    id,
    customerId: session.userId,
    customerEmail: session.email,
    items: [{ key: product.key, name: product.name, quantity: 1 }],
    pricing: priced,
    status: opts.status || "awaiting_payment",
    provider: "stripe",
    createdAt: NOW().toISOString(),
  });
  return { id };
}

const fullAnswers = {
  businessName: "Riverside Plumbing",
  contactName: "Jane Doe",
  businessDescription: "Emergency and scheduled plumbing.",
  services: "Repairs, installs, emergency callouts",
};

/* ------------------------------------------------------------- orders --- */

test("orders can't be read without a session", async () => {
  reset();
  const res = await orders.handler(req("GET"), {}, { readCookie: () => null, getSession: async () => null });
  assert.equal(res.statusCode, 401);
});

test("the create route is closed -- orders come from checkout only", async () => {
  reset();
  const res = await orders.handler(req("POST", { planKey: "premium" }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 410);
});

test("an order reads back with its items, its totals and its next step", async () => {
  reset();
  seedOrder({ id: "order-1" });
  const res = await orders.handler(req("GET"), {}, deps(CUSTOMER));
  const [order] = JSON.parse(res.body).orders;
  assert.equal(order.summary, "Premium");
  assert.equal(order.chargedTodayCents, 37800, "deposit plus the first month, which Stripe bills immediately");
  assert.equal(order.monthlyCents, 12900);
  assert.equal(order.needsBrief, true);
  assert.equal(order.status, "awaiting_payment");
});

test("a customer only ever sees their own orders", async () => {
  reset();
  seedOrder();
  const other = await orders.handler(req("GET"), {}, deps({ userId: "cust-2", email: "someone@else.test", role: "customer" }));
  assert.deepEqual(JSON.parse(other.body).orders, []);
});

test("a customer cannot confirm their own payment", async () => {
  reset();
  const created = seedOrder();
  const res = await orders.handler(req("PATCH", { id: created.id, action: "confirm-payment" }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 403);
});

test("an admin can confirm payment by hand when a webhook never arrives", async () => {
  reset();
  const created = seedOrder();
  const res = await orders.handler(req("PATCH", { id: created.id, action: "confirm-payment" }), {}, deps(ADMIN));
  assert.equal(JSON.parse(res.body).order.status, "paid");
});

test("the all-orders view is admin only", async () => {
  reset();
  seedOrder();
  assert.equal((await orders.handler(req("GET", null, { all: "true" }), {}, deps(CUSTOMER))).statusCode, 403);
  assert.equal((await orders.handler(req("GET", null, { all: "true" }), {}, deps(ADMIN))).statusCode, 200);
});

/* -------------------------------------------------------------- brief --- */

async function paidOrder() {
  reset();
  const created = seedOrder({ status: "paid" });
  sent.length = 0;
  return created;
}

test("the brief is locked until the payment is actually confirmed", async () => {
  reset();
  const created = seedOrder();
  const res = await brief.handler(req("POST", { orderId: created.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 409);
});

test("a delayed payment method still unlocks the brief while it settles", async () => {
  reset();
  // Some buy-now-pay-later methods complete the Stripe session before the
  // money confirms. Making someone wait days on that kills the momentum the
  // brief depends on, and nothing is built until the order reaches `paid`.
  const created = seedOrder({ status: "payment_processing" });
  const res = await brief.handler(req("POST", { orderId: created.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 200, res.body);
});

test("a cancelled order can't have a brief submitted against it", async () => {
  reset();
  const created = seedOrder({ status: "cancelled" });
  const res = await brief.handler(req("POST", { orderId: created.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 409);
});

test("required fields are enforced, and named in the error", async () => {
  const o = await paidOrder();
  const res = await brief.handler(req("POST", { orderId: o.id, answers: { businessName: "X" } }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Main contact/);
});

test("a draft saves without the required-field check", async () => {
  const o = await paidOrder();
  const res = await brief.handler(req("POST", { orderId: o.id, draft: true, answers: { businessName: "Half done" } }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 200);
  const got = JSON.parse((await brief.handler(req("GET", null, { orderId: o.id }), {}, deps(CUSTOMER))).body);
  assert.equal(got.answers.businessName, "Half done");
  assert.equal(got.submitted, false);
});

test("submitting emails Dylan the PDF, files a copy, and closes the order", async () => {
  const o = await paidOrder();
  const res = await brief.handler(req("POST", { orderId: o.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  assert.equal(res.statusCode, 200, res.body);

  const toAdmin = sent.find((m) => m.to === "dylan@lit-solutions.tech");
  assert.ok(toAdmin, "Dylan should be emailed");
  assert.equal(toAdmin.attachments.length, 1);
  assert.match(toAdmin.attachments[0].filename, /\.pdf$/);
  assert.equal(Buffer.from(toAdmin.attachments[0].content, "base64").slice(0, 5).toString(), "%PDF-");
  assert.match(toAdmin.html, /Riverside Plumbing/, "answers should be readable inline too");

  const toCustomer = sent.find((m) => m.to === "jane@example.test");
  assert.ok(toCustomer, "the customer should get a confirmation");

  const docKey = [...blobs.keys()].find((k) => k.startsWith("documents::"));
  assert.ok(docKey, "a copy belongs in the customer's Documents tab");
  const doc = blobs.get(docKey);
  assert.equal(doc.customerId, "cust-1");
  assert.match(doc.fileDataUri, /^data:application\/pdf;base64,/);

  const after = JSON.parse((await orders.handler(req("GET"), {}, deps(CUSTOMER))).body).orders[0];
  assert.equal(after.status, "brief_submitted");
  assert.ok(after.briefDocumentId);
});

test("submitting twice doesn't send a second copy", async () => {
  const o = await paidOrder();
  await brief.handler(req("POST", { orderId: o.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  const before = sent.length;
  const res = await brief.handler(req("POST", { orderId: o.id, answers: fullAnswers }), {}, deps(CUSTOMER));
  assert.equal(JSON.parse(res.body).alreadySubmitted, true);
  assert.equal(sent.length, before, "no duplicate emails");
});

test("someone else's brief is off limits", async () => {
  const o = await paidOrder();
  const res = await brief.handler(req("GET", null, { orderId: o.id }), {},
    deps({ userId: "cust-2", email: "x@y.test", role: "customer" }));
  assert.equal(res.statusCode, 403);
});

/* ---------------------------------------------------------------- pdf --- */

test("the PDF is generated from stored answers, not an uploaded file", () => {
  const out = renderBriefPdf({
    order: { id: "o1", planName: "Premium", planKey: "premium" },
    answers: { businessName: "Riverside Plumbing", businessDescription: "x ".repeat(900) },
    customer: { email: "jane@example.test" },
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  const buf = Buffer.from(out.base64, "base64");
  assert.equal(buf.slice(0, 5).toString(), "%PDF-");
  assert.ok(buf.length > 1000);
  assert.match(out.filename, /^project-brief-Riverside-Plumbing\.pdf$/);
});

test("the PDF filename can't carry path separators out of a business name", () => {
  const out = renderBriefPdf({
    order: { id: "o1", planName: "Premium", planKey: "premium" },
    answers: { businessName: "../../etc/passwd" },
    customer: { email: "a@b.test" },
    submittedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.doesNotMatch(out.filename, /[/\\.]{2}/);
  assert.match(out.filename, /^project-brief-[a-z0-9-]+\.pdf$/i);
});

test("every catalogued field appears on the form definition", () => {
  assert.ok(BRIEF_FIELDS.length >= 10);
  for (const f of BRIEF_FIELDS) {
    assert.ok(f.key && f.label, `field missing key/label: ${JSON.stringify(f)}`);
  }
});
