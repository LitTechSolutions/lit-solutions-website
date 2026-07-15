const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionChecklistSubmission, canCustomerEdit } = require("./checklistSubmissionWorkflow");

test("draft -> submitted is legal", () => {
  assert.equal(transitionChecklistSubmission("draft", "submitted").allowed, true);
});

test("submitted -> returned is legal (staff sends back for changes)", () => {
  assert.equal(transitionChecklistSubmission("submitted", "returned").allowed, true);
});

test("submitted -> verified is legal (staff approves)", () => {
  assert.equal(transitionChecklistSubmission("submitted", "verified").allowed, true);
});

test("returned -> submitted is legal (customer resubmits)", () => {
  assert.equal(transitionChecklistSubmission("returned", "submitted").allowed, true);
});

test("verified is terminal -- no further transitions", () => {
  assert.equal(transitionChecklistSubmission("verified", "submitted").allowed, false);
  assert.equal(transitionChecklistSubmission("verified", "draft").allowed, false);
});

test("draft cannot skip straight to verified or returned", () => {
  assert.equal(transitionChecklistSubmission("draft", "verified").allowed, false);
  assert.equal(transitionChecklistSubmission("draft", "returned").allowed, false);
});

test("submitted cannot go back to draft directly", () => {
  assert.equal(transitionChecklistSubmission("submitted", "draft").allowed, false);
});

test("an unknown current or target status is rejected, not silently allowed", () => {
  assert.equal(transitionChecklistSubmission("bogus", "submitted").allowed, false);
  assert.equal(transitionChecklistSubmission("draft", "bogus").allowed, false);
});

test("every decision includes a non-empty reason", () => {
  for (const decision of [transitionChecklistSubmission("draft", "submitted"), transitionChecklistSubmission("verified", "draft")]) {
    assert.equal(typeof decision.reason, "string");
    assert.ok(decision.reason.length > 0);
  }
});

test("canCustomerEdit is true only for draft and returned", () => {
  assert.equal(canCustomerEdit("draft"), true);
  assert.equal(canCustomerEdit("returned"), true);
  assert.equal(canCustomerEdit("submitted"), false);
  assert.equal(canCustomerEdit("verified"), false);
});
