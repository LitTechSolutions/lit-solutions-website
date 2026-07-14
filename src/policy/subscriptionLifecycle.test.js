const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionSubscriptionStatus } = require("./subscriptionLifecycle");

test("active can be paused or cancelled", () => {
  assert.equal(transitionSubscriptionStatus("active", "paused").allowed, true);
  assert.equal(transitionSubscriptionStatus("active", "cancelled").allowed, true);
});

test("paused can be resumed to active or cancelled", () => {
  assert.equal(transitionSubscriptionStatus("paused", "active").allowed, true);
  assert.equal(transitionSubscriptionStatus("paused", "cancelled").allowed, true);
});

test("cancelled is terminal", () => {
  assert.equal(transitionSubscriptionStatus("cancelled", "active").allowed, false);
  assert.equal(transitionSubscriptionStatus("cancelled", "paused").allowed, false);
});

test("unknown statuses are rejected", () => {
  assert.equal(transitionSubscriptionStatus("bogus", "active").allowed, false);
});
