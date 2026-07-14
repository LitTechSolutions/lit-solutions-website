const test = require("node:test");
const assert = require("node:assert/strict");
const { assembleWorkQueue } = require("./workQueueViewModel");

function ticket(overrides = {}) {
  return { id: "t1", organizationId: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submittedAt: "z", submittedBy: "u", updatedAt: "z", version: 1, ...overrides };
}

test("counts only open tickets, excluding closed/resolved", () => {
  const result = assembleWorkQueue({
    tickets: [ticket({ status: "in_progress" }), ticket({ id: "t2", status: "closed" }), ticket({ id: "t3", status: "resolved" })],
    approvals: [],
    paymentRequests: [],
    incidentStatuses: [],
  });
  assert.equal(result.totalOpenTickets, 1);
});

test("groups open tickets by priority level", () => {
  const result = assembleWorkQueue({
    tickets: [
      ticket({ id: "t1", status: "in_progress", priorityLevel: "high" }),
      ticket({ id: "t2", status: "submitted", priorityLevel: "low" }),
    ],
    approvals: [],
    paymentRequests: [],
    incidentStatuses: [],
  });
  assert.equal(result.openTicketsByPriority.high.length, 1);
  assert.equal(result.openTicketsByPriority.low.length, 1);
});

test("a ticket with no priority assessment yet defaults into critical (fail toward visibility)", () => {
  const result = assembleWorkQueue({
    tickets: [ticket({ status: "submitted" })], // no priorityLevel
    approvals: [],
    paymentRequests: [],
    incidentStatuses: [],
  });
  assert.equal(result.openTicketsByPriority.critical.length, 1);
});

test("counts only pending approvals", () => {
  const result = assembleWorkQueue({
    tickets: [],
    approvals: [
      { id: "a1", organizationId: "org-a", subjectType: "scope", subjectId: "s1", status: "pending", requestedAt: "x", requestedBy: "u", expiresAt: "y" },
      { id: "a2", organizationId: "org-a", subjectType: "scope", subjectId: "s2", status: "approved", requestedAt: "x", requestedBy: "u", expiresAt: "y" },
    ],
    paymentRequests: [],
    incidentStatuses: [],
  });
  assert.equal(result.pendingApprovalCount, 1);
});

test("counts payments needing reconciliation (paid or reconciliation_pending)", () => {
  const result = assembleWorkQueue({
    tickets: [],
    approvals: [],
    paymentRequests: [
      { id: "p1", organizationId: "org-a", amountRef: "ref-1", status: "paid" },
      { id: "p2", organizationId: "org-a", amountRef: "ref-2", status: "reconciliation_pending" },
      { id: "p3", organizationId: "org-a", amountRef: "ref-3", status: "reconciled" },
    ],
    incidentStatuses: [],
  });
  assert.equal(result.paymentsNeedingReconciliation, 2);
});

test("counts open incidents (down or investigating)", () => {
  const result = assembleWorkQueue({ tickets: [], approvals: [], paymentRequests: [], incidentStatuses: ["up", "down", "investigating", "up"] });
  assert.equal(result.openIncidentCount, 2);
});

test("throws on an invalid ticket status (fail loud, not silent)", () => {
  assert.throws(() => assembleWorkQueue({ tickets: [ticket({ status: "not_a_real_status" })], approvals: [], paymentRequests: [], incidentStatuses: [] }));
});

test("handles empty input gracefully", () => {
  const result = assembleWorkQueue({});
  assert.equal(result.totalOpenTickets, 0);
  assert.equal(result.pendingApprovalCount, 0);
});
