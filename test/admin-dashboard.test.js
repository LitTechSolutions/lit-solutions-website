const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/admin-dashboard");

function getEvent(query = {}) {
  return { httpMethod: "GET", headers: { cookie: "lts_session=x" }, queryStringParameters: query };
}

const records = {
  users: [
    { key: "customer@example.com", id: "c1", role: "customer", name: "Customer One", email: "customer@example.com", verified: true, passwordHash: "must-never-leak", createdAt: 100 },
    { key: "admin@example.com", id: "a1", role: "admin", name: "Admin", email: "admin@example.com", passwordHash: "also-secret" },
  ],
  orders: [{ key: "o1", id: "o1", customerId: "c1", customerEmail: "customer@example.com", status: "paid", amountPaidCents: 50000, createdAt: 200, items: [{ key: "plan-standard", name: "Standard Website", kind: "plan" }] }],
  documents: [{ key: "d1", customerId: "c1", uploadedAt: 250, cloudinaryPublicId: "private" }],
  messages: [{ key: "m1", customerId: "c1", customerEmail: "customer@example.com", from: "customer", body: "Can we start next week?", createdAt: 300, readByStaff: false }],
  leads: [{ key: "L1", id: "L1", customerName: "Prospect", businessName: "Prospect LLC", email: "p@example.com", estimateTotal: 1200, createdAt: 400, resumeTokenHash: "secret" }],
  inquiries: [{ key: "I1", id: "I1", form: "intake", fullName: "New Client", email: "new@example.com", reason: "Need a website", createdAt: 350, ip: "private" }],
};

function adminDeps(extra = {}) {
  return {
    readCookie: () => "x",
    getSession: async () => ({ userId: "a1", role: "admin" }),
    listRecords: async (name) => records[name] || [],
    ...extra,
  };
}

test("the admin aggregate returns useful metrics and never leaks stored secrets", async () => {
  const res = await handler(getEvent(), {}, adminDeps());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.metrics.customers, 1);
  assert.equal(body.metrics.paidOrders, 1);
  assert.equal(body.metrics.grossCents, 50000);
  assert.equal(body.metrics.newLeads, 2);
  assert.equal(body.metrics.unreadMessages, 1);
  assert.equal(body.customers[0].lifetimeValueCents, 50000);
  assert.equal(body.orders[0].needsBrief, true);
  const raw = JSON.stringify(body);
  assert.doesNotMatch(raw, /passwordHash|resumeTokenHash|cloudinaryPublicId|"ip"/);
});

test("a customer cannot read the cross-customer admin aggregate", async () => {
  const res = await handler(getEvent(), {}, adminDeps({ getSession: async () => ({ userId: "c1", role: "customer" }) }));
  assert.equal(res.statusCode, 403);
});

test("updating a lead stage persists the real source record", async () => {
  const writes = [];
  const event = { httpMethod: "PATCH", headers: { cookie: "lts_session=x" }, body: JSON.stringify({ action: "update-lead", source: "leads", id: "L1", status: "qualified" }) };
  const res = await handler(event, {}, adminDeps({
    getJSON: async () => ({ id: "L1", businessName: "Prospect LLC", email: "p@example.com", adminNote: "Keep this" }),
    setJSON: async (...args) => writes.push(args),
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(writes[0][0], "leads");
  assert.equal(writes[0][2].adminStatus, "qualified");
  assert.equal(writes[0][2].adminNote, "Keep this");
});

test("system health reports booleans and configuration mode without key material", async () => {
  const res = await handler(getEvent({ view: "system" }), {}, adminDeps({
    checkoutStatus: () => ({ enabled: true, mode: "public", reason: null }),
    resolveStripe: () => ({ ok: true, mode: "live", webhookSecret: "hidden", available: { STRIPE_SECRET_KEY: true } }),
    env: {},
  }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.system.checkout.enabled, true);
  assert.equal(body.system.stripe.mode, "live");
  assert.equal(body.system.stripe.keyConfigured, true);
  assert.equal(body.system.stripe.webhookSecretConfigured, true);
  assert.doesNotMatch(JSON.stringify(body), /hidden/);
});
