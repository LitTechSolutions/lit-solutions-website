const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionTicketStatus, canReopen, DEFAULT_REOPEN_WINDOW_DAYS } = require("./ticketLifecycle");

test("the golden path: submitted -> triaged -> assigned -> in_progress -> resolved -> closed", () => {
  const path = ["submitted", "triaged", "assigned", "in_progress", "resolved", "closed"];
  for (let i = 0; i < path.length - 1; i++) {
    const decision = transitionTicketStatus(path[i], path[i + 1]);
    assert.equal(decision.allowed, true, `${path[i]} -> ${path[i + 1]} should be legal`);
  }
});

test("cannot skip triage/assignment (submitted -> in_progress directly)", () => {
  const decision = transitionTicketStatus("submitted", "in_progress");
  assert.equal(decision.allowed, false);
});

test("in_progress can go to waiting_on_customer and back", () => {
  assert.equal(transitionTicketStatus("in_progress", "waiting_on_customer").allowed, true);
  assert.equal(transitionTicketStatus("waiting_on_customer", "in_progress").allowed, true);
});

test("resolved can go back to in_progress without a formal reopen (still-open work)", () => {
  assert.equal(transitionTicketStatus("resolved", "in_progress").allowed, true);
});

test("closed tickets cannot transition directly back to in_progress -- must go through reopened", () => {
  const decision = transitionTicketStatus("closed", "in_progress");
  assert.equal(decision.allowed, false);
});

test("closed -> reopened -> in_progress is the only path back from closed", () => {
  assert.equal(transitionTicketStatus("closed", "reopened").allowed, true);
  assert.equal(transitionTicketStatus("reopened", "in_progress").allowed, true);
});

test("unknown statuses are rejected", () => {
  assert.equal(transitionTicketStatus("bogus", "closed").allowed, false);
  assert.equal(transitionTicketStatus("submitted", "bogus").allowed, false);
});

test("canReopen: allowed within the default 14-day window", () => {
  const ticket = { status: "closed", closedAt: "2026-07-01T00:00:00.000Z" };
  const now = new Date("2026-07-10T00:00:00.000Z");
  assert.equal(canReopen(ticket, now).allowed, true);
});

test("canReopen: denied after the window has passed", () => {
  const ticket = { status: "closed", closedAt: "2026-07-01T00:00:00.000Z" };
  const now = new Date("2026-08-01T00:00:00.000Z");
  const decision = canReopen(ticket, now);
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /window.*passed/);
});

test("canReopen: window is configurable, not hardcoded", () => {
  const ticket = { status: "closed", closedAt: "2026-07-01T00:00:00.000Z" };
  const now = new Date("2026-07-05T00:00:00.000Z");
  assert.equal(canReopen(ticket, now, 3).allowed, false); // 4 days elapsed, 3-day window
  assert.equal(canReopen(ticket, now, 10).allowed, true); // 4 days elapsed, 10-day window
});

test("canReopen: denied for a non-closed ticket", () => {
  const decision = canReopen({ status: "in_progress" }, new Date());
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /only closed tickets/);
});

test("DEFAULT_REOPEN_WINDOW_DAYS is exported and used as the default", () => {
  assert.equal(DEFAULT_REOPEN_WINDOW_DAYS, 14);
});
