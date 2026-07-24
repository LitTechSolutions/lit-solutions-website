const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/site-forms");

function fakeDeps(overrides = {}) {
  const store = new Map();
  const emails = [];
  return {
    rateLimited: async () => false,
    setJSON: async (_ns, key, value) => { store.set(key, value); },
    sendEmail: async (opts) => { emails.push(opts); return { sent: true }; },
    _store: store,
    _emails: emails,
    ...overrides,
  };
}

function eventFor(body) {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify(body) };
}

test("rejects non-POST requests", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, {}, fakeDeps());
  assert.equal(res.statusCode, 405);
});

test("rejects an unknown form discriminator", async () => {
  const res = await handler(eventFor({ form: "carrier-pigeon" }), {}, fakeDeps());
  assert.equal(res.statusCode, 400);
});

test("enforces the shared rate limit before touching any form logic", async () => {
  const deps = fakeDeps({ rateLimited: async () => true });
  const res = await handler(eventFor({ form: "newsletter", email: "a@example.com" }), {}, deps);
  assert.equal(res.statusCode, 429);
  assert.equal(deps._store.size, 0);
});

test("booking: accepts email-only contact info", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({
    form: "booking", name: "Sam", email: "sam@example.com", phone: "",
    serviceType: "Networking", preferredDate: "2026-08-01", preferredTime: "Morning (8am–12pm)",
  }), {}, deps);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).id.startsWith("BOOKING-"), true);
});

test("booking: accepts phone-only contact info", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({
    form: "booking", name: "Sam", email: "", phone: "5555555555",
    serviceType: "Networking", preferredDate: "2026-08-01", preferredTime: "No preference",
  }), {}, deps);
  assert.equal(res.statusCode, 201);
});

test("booking: rejects when neither email nor phone is given", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({
    form: "booking", name: "Sam", email: "", phone: "",
    serviceType: "Networking", preferredDate: "2026-08-01", preferredTime: "No preference",
  }), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.equal(deps._store.size, 0);
});

test("booking: rejects a service type outside the fixed list", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({
    form: "booking", name: "Sam", email: "sam@example.com", serviceType: "Something made up",
    preferredDate: "2026-08-01", preferredTime: "No preference",
  }), {}, deps);
  assert.equal(res.statusCode, 400);
});

test("booking: rejects a preferred time outside the fixed list", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({
    form: "booking", name: "Sam", email: "sam@example.com", serviceType: "Networking",
    preferredDate: "2026-08-01", preferredTime: "Middle of the night",
  }), {}, deps);
  assert.equal(res.statusCode, 400);
});

test("newsletter: stores a valid email", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "newsletter", email: "reader@example.com" }), {}, deps);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).id.startsWith("NEWSLETTER-"), true);
});

test("newsletter: rejects an invalid email", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "newsletter", email: "nope" }), {}, deps);
  assert.equal(res.statusCode, 400);
});

function minimalIntake(overrides = {}) {
  return {
    form: "intake",
    fullName: "Pat Customer", email: "pat@example.com", phone: "555-111-2222",
    contactMethod: "Phone Call", reason: "Not sure what I need yet, just want to talk it through.",
    ...overrides,
  };
}

test("intake: accepts a minimal 5-field submission", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ email: "Pat@Example.com" })), {}, deps);
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.id.startsWith("INTAKE-"));
  assert.equal(body.emailSent, true);
  const stored = deps._store.get(body.id);
  assert.equal(stored.fullName, "Pat Customer");
  assert.equal(stored.email, "pat@example.com"); // stored lowercased, matching the other 3 forms
  assert.equal(stored.phone, "555-111-2222");
  assert.equal(stored.contactMethod, "Phone Call");
  assert.match(deps._emails[0].html, /Not sure what I need yet/);
});

test("intake: rejects a preferred contact method outside the fixed list", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ contactMethod: "Carrier Pigeon" })), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.equal(deps._store.size, 0);
});

test("intake: HTML in the reason field is escaped, not executed, in the outbound email", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({
    fullName: '<script>alert(1)</script>', reason: "Need help with <b>tags</b> & \"quotes\".",
  })), {}, deps);
  assert.equal(res.statusCode, 201);
  const html = deps._emails[0].html;
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;tags&lt;\/b&gt;/);
  assert.match(html, /&amp;/);
});

test("intake: reports every missing required field at once", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "intake" }), {}, deps);
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.match(body.error, /Full Name/);
  assert.match(body.error, /Email Address/);
  assert.match(body.error, /Phone Number/);
  assert.match(body.error, /Preferred contact method/);
  assert.match(body.error, /What can we help you with/);
  assert.equal(deps._store.size, 0);
});

test("intake: rejects an invalid email", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ email: "not-an-email" })), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.equal(deps._store.size, 0);
});

test("intake: a filled honeypot pretends success without storing or emailing", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ botField: "gotcha" })), {}, deps);
  assert.equal(res.statusCode, 201);
  assert.equal(deps._store.size, 0);
  assert.equal(deps._emails.length, 0);
});
