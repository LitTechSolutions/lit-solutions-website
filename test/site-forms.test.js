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
  const res = await handler(eventFor({ form: "contact", name: "A", email: "a@example.com", message: "hi" }), {}, deps);
  assert.equal(res.statusCode, 429);
  assert.equal(deps._store.size, 0);
});

test("contact: stores the submission and emails Dylan", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "contact", name: "Jane Doe", email: "jane@example.com", message: "Need a quote" }), {}, deps);
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.id.startsWith("CONTACT-"));
  assert.equal(body.emailSent, true);
  const stored = deps._store.get(body.id);
  assert.equal(stored.name, "Jane Doe");
  assert.equal(stored.email, "jane@example.com");
  assert.equal(deps._emails.length, 1);
  assert.match(deps._emails[0].html, /Need a quote/);
});

test("contact: rejects a missing message", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "contact", name: "Jane", email: "jane@example.com", message: "" }), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.equal(deps._store.size, 0);
});

test("contact: rejects an invalid email", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "contact", name: "Jane", email: "not-an-email", message: "hi" }), {}, deps);
  assert.equal(res.statusCode, 400);
});

test("contact: a filled honeypot pretends success without storing or emailing", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "contact", name: "Bot", email: "bot@example.com", message: "spam", botField: "gotcha" }), {}, deps);
  assert.equal(res.statusCode, 201);
  assert.equal(deps._store.size, 0);
  assert.equal(deps._emails.length, 0);
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
    fullName: "Pat Customer", businessName: "Pat's Shop", email: "pat@example.com", phone: "555-111-2222",
    addressCity: "Montross, VA", referralSource: "Google", contactMethod: "Phone Call", bestTime: "No preference",
    services: ["Not sure yet"], generalNotes: "Not sure what I need yet.",
    ...overrides,
  };
}

test("intake: accepts a minimal submission with no optional sections triggered", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake()), {}, deps);
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.id.startsWith("INTAKE-"));
  const stored = deps._store.get(body.id);
  assert.equal(stored.businessName, "Pat's Shop");
  assert.deepEqual(stored.services, ["Not sure yet"]);
});

test("intake: reports every missing always-required field at once", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor({ form: "intake", services: [] }), {}, deps);
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.match(body.error, /Full Name/);
  assert.match(body.error, /What do you need help with/);
  assert.equal(deps._store.size, 0);
});

test("intake: checking Website Services requires the section-3 fields", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ services: ["Website Services"] })), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Business description/);
});

test("intake: Website Services with all section-3 fields filled succeeds", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({
    services: ["Website Services"],
    currentWebsite: "N/A", requestedDomain: "patsshop.com", businessDescription: "We sell things.",
    targetCustomers: "Locals", mustHavePages: "Home, Contact", mustHaveFeatures: "Contact form",
    stylePreference: "Clean", inspirationSites: "N/A", existingContent: "N/A", photosImagery: "N/A",
    hasLogo: "Need one", hasContent: "Need help", hasDomain: "Need help", timeline: "2 months", budgetRange: "$1000",
  })), {}, deps);
  assert.equal(res.statusCode, 201);
});

test("intake: checking government contracting requires the section-4 fields", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({ govContractingInterest: true })), {}, deps);
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /UEI/);
});

test("intake: government contracting with all section-4 fields filled succeeds", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({
    govContractingInterest: true, ueiNumber: "ABC123", naicsCodes: "541511", samGovInfo: "N/A", certifications: "N/A",
  })), {}, deps);
  assert.equal(res.statusCode, 201);
  assert.equal(deps._store.get(JSON.parse(res.body).id).govContractingInterest, true);
});

test("intake: additionalNotes is always optional even with both sections triggered", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor(minimalIntake({
    services: ["Website Services"],
    currentWebsite: "N/A", requestedDomain: "N/A", businessDescription: "N/A", targetCustomers: "N/A",
    mustHavePages: "N/A", mustHaveFeatures: "N/A", stylePreference: "N/A", inspirationSites: "N/A",
    existingContent: "N/A", photosImagery: "N/A", hasLogo: "N/A", hasContent: "N/A", hasDomain: "N/A",
    timeline: "N/A", budgetRange: "N/A",
    govContractingInterest: true, ueiNumber: "N/A", naicsCodes: "N/A", samGovInfo: "N/A", certifications: "N/A",
  })), {}, deps);
  assert.equal(res.statusCode, 201);
});
