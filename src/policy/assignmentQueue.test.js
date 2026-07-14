const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAssignee } = require("./assignmentQueue");

function tech(overrides = {}) {
  return { userId: "tech-1", organizationAssignments: ["org-a"], openTicketCount: 0, available: true, ...overrides };
}

test("selects the only eligible technician assigned to the organization", () => {
  const result = selectAssignee([tech({ userId: "tech-1" })], "org-a");
  assert.equal(result.technicianUserId, "tech-1");
});

test("selects the least-loaded of several eligible technicians", () => {
  const result = selectAssignee(
    [tech({ userId: "tech-busy", openTicketCount: 5 }), tech({ userId: "tech-free", openTicketCount: 1 })],
    "org-a"
  );
  assert.equal(result.technicianUserId, "tech-free");
});

test("excludes technicians not assigned to this organization", () => {
  const result = selectAssignee([tech({ userId: "tech-other-org", organizationAssignments: ["org-b"] })], "org-a");
  assert.equal(result.technicianUserId, null);
  assert.match(result.reason, /no available technician/);
});

test("excludes unavailable technicians even if assigned", () => {
  const result = selectAssignee([tech({ userId: "tech-unavailable", available: false })], "org-a");
  assert.equal(result.technicianUserId, null);
});

test("returns null with a clear reason when the candidate pool is empty", () => {
  const result = selectAssignee([], "org-a");
  assert.equal(result.technicianUserId, null);
});

test("rejects a malformed candidate", () => {
  assert.throws(() => selectAssignee([{ userId: "bad" }], "org-a"));
});
