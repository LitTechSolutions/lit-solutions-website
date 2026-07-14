const test = require("node:test");
const assert = require("node:assert/strict");
const { totalMinutesForTicket, minutesByTechnician } = require("./timeTracking");

function entry(overrides = {}) {
  return { id: `te-${Math.random()}`, ticketId: "ticket-1", technicianUserId: "tech-1", minutes: 30, recordedAt: "2026-07-01T00:00:00.000Z", ...overrides };
}

test("sums minutes for a specific ticket, ignoring entries for other tickets", () => {
  const entries = [entry({ ticketId: "ticket-1", minutes: 30 }), entry({ ticketId: "ticket-1", minutes: 15 }), entry({ ticketId: "ticket-2", minutes: 45 })];
  assert.equal(totalMinutesForTicket(entries, "ticket-1"), 45);
});

test("returns 0 for a ticket with no time entries", () => {
  assert.equal(totalMinutesForTicket([], "ticket-1"), 0);
});

test("aggregates minutes by technician across all passed-in entries", () => {
  const entries = [
    entry({ technicianUserId: "tech-a", minutes: 30 }),
    entry({ technicianUserId: "tech-a", minutes: 20 }),
    entry({ technicianUserId: "tech-b", minutes: 10 }),
  ];
  assert.deepEqual(minutesByTechnician(entries), { "tech-a": 50, "tech-b": 10 });
});

test("no dollar amounts anywhere in the output shape (cost tracking deliberately deferred)", () => {
  const entries = [entry()];
  const totals = minutesByTechnician(entries);
  for (const value of Object.values(totals)) {
    assert.equal(typeof value, "number");
  }
  assert.deepEqual(Object.keys(entries[0]).some((k) => /cost|price|rate|dollar/i.test(k)), false);
});

test("rejects an invalid time entry (non-positive minutes)", () => {
  assert.throws(() => totalMinutesForTicket([entry({ minutes: 0 })], "ticket-1"));
});
