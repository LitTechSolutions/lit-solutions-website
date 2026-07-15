const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/work-queue");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("tickets")) return byTable.tickets || [];
    if (text.includes("approval_requests")) return byTable.approvals || [];
    if (text.includes("payment_requests")) return byTable.paymentRequests || [];
    if (text.includes("incident_records")) return byTable.incidents || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuthDeps(role) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId: "user-1", role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
  };
}

test("GET without a session returns 401", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("GET as a technician (legacy 'staff' role) is denied -- workqueue.view is platform_admin only", async () => {
  const sql = routingFakeSql({});
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, { ...fakeAuthDeps("staff"), sql });
  assert.equal(res.statusCode, 403);
});

test("GET as a customer is denied", async () => {
  const sql = routingFakeSql({});
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, { ...fakeAuthDeps("customer"), sql });
  assert.equal(res.statusCode, 403);
});

test("GET as platform_admin (legacy 'admin' role) returns the assembled cross-org work queue", async () => {
  const sql = routingFakeSql({
    tickets: [{ id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "u", updated_at: "2026-07-01T00:00:00.000Z", version: 1, priority_level: "high" }],
    approvals: [{ id: "a1", organization_id: "org-a", subject_type: "scope", subject_id: "s1", status: "pending", requested_at: "2026-07-01T00:00:00.000Z", requested_by: "u", expires_at: "2026-08-01T00:00:00.000Z" }],
  });
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, { ...fakeAuthDeps("admin"), sql });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.workQueue.totalOpenTickets, 1);
  assert.equal(body.workQueue.pendingApprovalCount, 1);
  assert.equal(body.workQueue.openTicketsByPriority.high.length, 1);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
