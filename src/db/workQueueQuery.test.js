const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchWorkQueue } = require("./workQueueQuery");

function routingFakeSql(byTable) {
  const tag = async (strings) => {
    const text = strings.join("?");
    if (text.includes("FROM tickets")) return byTable.tickets || [];
    if (text.includes("FROM approval_requests")) return byTable.approvals || [];
    if (text.includes("FROM payment_requests")) return byTable.payments || [];
    if (text.includes("FROM incident_records")) return byTable.incidents || [];
    return [];
  };
  return tag;
}

function ticketRow(overrides = {}) {
  return { id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "in_progress", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "u", updated_at: "2026-07-01T00:00:00.000Z", version: 1, priority_level: null, ...overrides };
}

// Integration: cross-org query results feed directly into the pure
// workQueueViewModel.js assembler.
test("integration: fetchWorkQueue queries across tables and assembles via workQueueViewModel.js", async () => {
  const sql = routingFakeSql({
    tickets: [ticketRow({ priority_level: "high" }), ticketRow({ id: "t2", status: "closed" })],
    approvals: [{ id: "a1", organization_id: "org-a", subject_type: "scope", subject_id: "s1", status: "pending", requested_at: "x", requested_by: "u", expires_at: "y" }],
    payments: [{ id: "p1", organization_id: "org-a", amount_ref: "ref-1", status: "paid" }],
    incidents: [{ status: "down" }],
  });

  const result = await fetchWorkQueue({ sql });

  assert.equal(result.totalOpenTickets, 1, "closed ticket excluded");
  assert.equal(result.openTicketsByPriority.high.length, 1);
  assert.equal(result.pendingApprovalCount, 1);
  assert.equal(result.paymentsNeedingReconciliation, 1);
  assert.equal(result.openIncidentCount, 1);
});

test("fetchWorkQueue handles an entirely empty system", async () => {
  const sql = routingFakeSql({});
  const result = await fetchWorkQueue({ sql });
  assert.equal(result.totalOpenTickets, 0);
});

test("a ticket with no priority_level row (LEFT JOIN NULL) defaults to critical via the assembler", async () => {
  const sql = routingFakeSql({ tickets: [ticketRow({ priority_level: null })] });
  const result = await fetchWorkQueue({ sql });
  assert.equal(result.openTicketsByPriority.critical.length, 1);
});
