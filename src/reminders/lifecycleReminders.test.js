const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateReminder, DEFAULT_THRESHOLD_DAYS } = require("./lifecycleReminders");

function reminder(overrides = {}) {
  return { id: "reminder-1", organizationId: "org-a", subjectId: "asset-1", subjectType: "warranty", expiresAt: "2026-08-13T00:00:00.000Z", sent: false, ...overrides };
}

const NOW = () => new Date("2026-07-14T00:00:00.000Z");

test("does not send when expiry is far outside the default window", () => {
  const result = evaluateReminder(reminder({ expiresAt: "2027-01-01T00:00:00.000Z" }), NOW());
  assert.equal(result.shouldSend, false);
});

test("sends when expiry is within the default 30-day window", () => {
  const result = evaluateReminder(reminder({ expiresAt: "2026-07-30T00:00:00.000Z" }), NOW());
  assert.equal(result.shouldSend, true);
});

test("still sends once even if the item already expired (a late reminder is better than none)", () => {
  const result = evaluateReminder(reminder({ expiresAt: "2026-06-01T00:00:00.000Z" }), NOW());
  assert.equal(result.shouldSend, true);
  assert.ok(result.daysUntilExpiry < 0);
});

test("never sends twice -- the sent flag is single-shot", () => {
  const result = evaluateReminder(reminder({ expiresAt: "2026-07-20T00:00:00.000Z", sent: true }), NOW());
  assert.equal(result.shouldSend, false);
  assert.match(result.reason, /already sent/);
});

test("threshold is configurable, not fixed to the 30-day default", () => {
  const closeCall = reminder({ expiresAt: "2026-07-20T00:00:00.000Z" }); // 6 days out
  assert.equal(evaluateReminder(closeCall, NOW(), 3).shouldSend, false);
  assert.equal(evaluateReminder(closeCall, NOW(), 10).shouldSend, true);
});

test("DEFAULT_THRESHOLD_DAYS is exported and used as the default", () => {
  assert.equal(DEFAULT_THRESHOLD_DAYS, 30);
});

// F037 (Domain, SSL & Subscription Renewal Tracking) reuses this exact
// engine rather than a second implementation -- same shape, different
// subjectType.
test("F037 reuse: an SSL certificate reminder behaves identically to a warranty reminder", () => {
  const sslReminder = reminder({ subjectType: "ssl_certificate", subjectId: "website-profile-1", expiresAt: "2026-07-25T00:00:00.000Z" });
  const result = evaluateReminder(sslReminder, NOW());
  assert.equal(result.shouldSend, true);
});

test("F037 reuse: a domain renewal reminder respects the same single-shot sent flag", () => {
  const domainReminder = reminder({ subjectType: "domain", subjectId: "website-profile-1", expiresAt: "2026-07-25T00:00:00.000Z", sent: true });
  const result = evaluateReminder(domainReminder, NOW());
  assert.equal(result.shouldSend, false);
});
