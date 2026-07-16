// Focused tests for the Session 17 open_registration feature-flag gate,
// plus the 2026-07-16 termsAccepted consent gate added when open
// registration was actually turned on. The rest of auth-register.js's
// behavior predates the deps-injection convention and isn't backfilled
// with tests here (getJSON/setJSON/sendEmail/sendVerificationEmail
// aren't overridable) -- only the gating logic, which is.

const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/auth-register");
const { createEmptyDocument, applyFeatureFlagUpdate } = require("../src/settings/settingsStore");

function disabledDoc() {
  return createEmptyDocument(); // no flags set at all -- fail closed
}

function enabledDoc() {
  return applyFeatureFlagUpdate(createEmptyDocument(), { key: "open_registration", enabled: true, updatedBy: "admin-1" }, { now: () => new Date("2026-07-15T00:00:00.000Z") });
}

test("registration is disabled by default (no open_registration flag present -- fail closed)", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X" }) },
    {},
    { loadSettingsDocument: async () => disabledDoc() }
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "registration_disabled");
});

test("registration is disabled when the flag is explicitly set to false", async () => {
  const doc = applyFeatureFlagUpdate(createEmptyDocument(), { key: "open_registration", enabled: false, updatedBy: "admin-1" }, { now: () => new Date("2026-07-15T00:00:00.000Z") });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X" }) },
    {},
    { loadSettingsDocument: async () => doc }
  );
  assert.equal(res.statusCode, 403);
});

test("registration proceeds past the flag gate once explicitly enabled (reaches rate limiting next)", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X" }) },
    {},
    { loadSettingsDocument: async () => enabledDoc(), rateLimited: async () => true }
  );
  assert.equal(res.statusCode, 429, "reaching the rate limiter (not the 403 gate) proves the flag check passed");
});

test("non-POST methods are rejected before the flag is even checked", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, {}, { loadSettingsDocument: async () => { throw new Error("should not be called"); } });
  assert.equal(res.statusCode, 405);
});

test("registration is rejected when termsAccepted is missing -- never inferred", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X" }) },
    {},
    { loadSettingsDocument: async () => enabledDoc(), rateLimited: async () => false }
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /agree to the Terms of Service/);
});

test("registration is rejected when termsAccepted is explicitly false", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X", termsAccepted: false }) },
    {},
    { loadSettingsDocument: async () => enabledDoc(), rateLimited: async () => false }
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /agree to the Terms of Service/);
});

test("a truthy but non-boolean termsAccepted (e.g. the string \"true\") is still rejected -- only a literal true passes", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "supersecurepassword", name: "X", termsAccepted: "true" }) },
    {},
    { loadSettingsDocument: async () => enabledDoc(), rateLimited: async () => false }
  );
  assert.equal(res.statusCode, 400);
});
