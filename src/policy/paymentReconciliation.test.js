const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionPaymentStatus } = require("./paymentReconciliation");

test("golden path: requested -> paid -> reconciled", () => {
  assert.equal(transitionPaymentStatus("requested", "paid").allowed, true);
  assert.equal(transitionPaymentStatus("paid", "reconciled").allowed, true);
});

test("golden path with a pending reconciliation step: requested -> paid -> reconciliation_pending -> reconciled", () => {
  assert.equal(transitionPaymentStatus("paid", "reconciliation_pending").allowed, true);
  assert.equal(transitionPaymentStatus("reconciliation_pending", "reconciled").allowed, true);
});

test("a requested payment can fail directly (e.g. declined)", () => {
  assert.equal(transitionPaymentStatus("requested", "failed").allowed, true);
});

test("a failed payment can be re-requested", () => {
  assert.equal(transitionPaymentStatus("failed", "requested").allowed, true);
});

test("reconciled is terminal -- no transitions out", () => {
  const decision = transitionPaymentStatus("reconciled", "paid");
  assert.equal(decision.allowed, false);
});

test("cannot skip straight from requested to reconciled", () => {
  const decision = transitionPaymentStatus("requested", "reconciled");
  assert.equal(decision.allowed, false);
});

test("unknown statuses are rejected", () => {
  assert.equal(transitionPaymentStatus("bogus", "paid").allowed, false);
});
