const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionIncidentStatus } = require("./incidentStatus");

test("up can move to investigating or straight to down", () => {
  assert.equal(transitionIncidentStatus("up", "investigating").allowed, true);
  assert.equal(transitionIncidentStatus("up", "down").allowed, true);
});

test("investigating can resolve back to up without ever confirming down (false alarm)", () => {
  assert.equal(transitionIncidentStatus("investigating", "up").allowed, true);
});

test("investigating can confirm down", () => {
  assert.equal(transitionIncidentStatus("investigating", "down").allowed, true);
});

test("down can only move to resolved", () => {
  assert.equal(transitionIncidentStatus("down", "resolved").allowed, true);
  assert.equal(transitionIncidentStatus("down", "up").allowed, false);
});

test("resolved returns to up on the next confirming check", () => {
  assert.equal(transitionIncidentStatus("resolved", "up").allowed, true);
});

test("cannot skip from up straight to resolved", () => {
  assert.equal(transitionIncidentStatus("up", "resolved").allowed, false);
});

test("unknown statuses rejected", () => {
  assert.equal(transitionIncidentStatus("bogus", "up").allowed, false);
});
