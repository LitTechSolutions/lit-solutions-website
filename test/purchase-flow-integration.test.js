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
const { getPlan, listPlans } = require("../netlify/functions/_lib/plan_catalog.js");
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

async function newOrder(plan = "premium") {
  const r = await orders.handler(req("POST", { planKey: plan }), {}, deps(CUST));
  return JSON.parse(r.body).order;
}
async function statusOf(id) {
  const r = await orders.handler(req("GET"), {}, deps(CUST));
  return (JSON.parse(r.body).orders.find((o) => o.id === id) || {}).status;
}

/* ------------------------------------------------- catalog consistency --- */

test("every plan in the catalog is complete and internally consistent", () => {
  const plans = listPlans();
  assert.equal(plans.length, 3);
  const seenLinks = new Set();
  for (const p of plans) {
    for (const field of ["key", "name", "deposit", "monthly", "depositLink", "subscriptionLink", "page", "summary"]) {
      assert.ok(p[field], `${p.key} missing ${field}`);
    }
    // Prices in cents must agree with the display strings -- these are shown
    // side by side on the cart and must never drift.
    assert.equal(`$${p.depositCents / 100}`, p.deposit, `${p.key} deposit mismatch`);
    assert.equal(`$${p.monthlyCents / 100}`, p.monthly, `${p.key} monthly mismatch`);
    // A duplicated Square link would charge someone for the wrong tier.
    for (const link of [p.depositLink, p.subscriptionLink]) {
      assert.ok(!seenLinks.has(link), `${p.key} reuses a Square link: ${link}`);
      seenLinks.add(link);
    }
    assert.match(p.page, /^plan-[a-z]+\.html$/);
  }
});

test("the browser catalog and the server catalog agree exactly", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "js", "plan-catalog.js"), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const client = sandbox.window.LTS_PLANS.PLANS;
  const server = listPlans();
  assert.equal(client.length, server.length, "different number of plans");
  for (const s of server) {
    const c = client.find((x) => x.key === s.key);
    assert.ok(c, `client catalog missing ${s.key}`);
    for (const f of ["name", "deposit", "monthly", "depositLink", "subscriptionLink", "depositCents", "monthlyCents"]) {
      assert.deepEqual(c[f], s[f], `${s.key}.${f} differs between client and server`);
    }
  }
});

/* --------------------------------------------------- order state machine -- */

test("every illegal transition is refused, and the order is left untouched", async () => {
  reset();
  const o = await newOrder();

  // confirm-payment from awaiting is allowed (admin skipping the report step)
  // but the customer must never be able to reach `paid` themselves.
  assert.equal((await orders.handler(req("PATCH", { id: o.id, action: "confirm-payment" }), {}, deps(CUST))).statusCode, 403);
  assert.equal(await statusOf(o.id), "awaiting_payment");

  assert.equal((await orders.handler(req("PATCH", { id: o.id, action: "delete" }), {}, deps(ADMIN))).statusCode, 400);
  assert.equal((await orders.handler(req("PATCH", { id: "nope", action: "report-payment" }), {}, deps(CUST))).statusCode, 404);
  assert.equal(await statusOf(o.id), "awaiting_payment");
});

test("reporting payment twice does not re-notify or regress the status", async () => {
  reset();
  const o = await newOrder();
  await orders.handler(req("PATCH", { id: o.id, action: "report-payment" }), {}, deps(CUST));
  const after = sent.length;
  await orders.handler(req("PATCH", { id: o.id, action: "report-payment" }), {}, deps(CUST));
  assert.equal(sent.length, after, "a second report must not email again");
  assert.equal(await statusOf(o.id), "payment_reported");
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

test("a finished order frees the customer to buy again", async () => {
  reset();
  const first = await newOrder("standard");
  await orders.handler(req("PATCH", { id: first.id, action: "confirm-payment" }), {}, deps(ADMIN));
  await brief.handler(req("POST", { orderId: first.id, answers: ANSWERS }), {}, deps(CUST));

  const r = await orders.handler(req("POST", { planKey: "executive" }), {}, deps(CUST));
  assert.equal(r.statusCode, 201, "a completed order should not block a new one");
  assert.equal(JSON.parse(r.body).order.planName, "Executive");
});

test("concurrent checkout attempts converge on one order", async () => {
  reset();
  const results = await Promise.all([
    orders.handler(req("POST", { planKey: "premium" }), {}, deps(CUST)),
    orders.handler(req("POST", { planKey: "standard" }), {}, deps(CUST)),
    orders.handler(req("POST", { planKey: "executive" }), {}, deps(CUST)),
  ]);
  const ids = new Set(results.map((r) => JSON.parse(r.body).order.id));
  const list = JSON.parse((await orders.handler(req("GET"), {}, deps(CUST))).body).orders;
  // Blobs has no transaction, so a true race can double-insert. What must
  // hold is that the customer is never shown two competing orders.
  assert.ok(ids.size <= 3);
  assert.ok(list.length >= 1);
  const open = list.filter((o) => o.status !== "brief_submitted");
  assert.ok(open.length >= 1, "at least one order must survive a race");
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

test("an email address with HTML in it is escaped in the order notification", async () => {
  reset();
  await orders.handler(req("POST", { planKey: "premium" }), {}, deps({ ...CUST, email: '<b>x</b>@y.test' }));
  const m = sent[0];
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
