const test = require("node:test");
const assert = require("node:assert/strict");
const { createApprovalRequest, listPendingApprovals, applyApprovalDecision, mapRowToApproval } = require("./approvalStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "approval-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function pendingRow(overrides = {}) {
  return {
    id: "appr-1",
    organization_id: "org-a",
    subject_type: "scope",
    subject_id: "scope-1",
    status: "pending",
    requested_at: "2026-07-01T00:00:00.000Z",
    requested_by: "user-tech-1",
    expires_at: "2026-08-01T00:00:00.000Z",
    decided_at: null,
    decided_by: null,
    decision_note: null,
    ...overrides,
  };
}

test("createApprovalRequest validates and inserts as pending", async () => {
  const sql = fakeSql();
  const approval = await createApprovalRequest(
    { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", requestedBy: "user-1", expiresAt: "2026-08-01T00:00:00.000Z" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(approval.status, "pending");
  assert.match(sql.calls[0].text, /INSERT INTO approval_requests/);
});

test("listPendingApprovals filters to pending status only, at the query level", async () => {
  const sql = fakeSql([pendingRow()]);
  const approvals = await listPendingApprovals("org-a", { sql });
  assert.equal(approvals.length, 1);
  assert.match(sql.calls[0].text, /status = 'pending'/);
});

// Integration: persistence + the pure approvalWorkflow.js state machine.
test("integration: applyApprovalDecision approves a pending request via the pure state machine", async () => {
  const sql = fakeSql([pendingRow()]);
  const result = await applyApprovalDecision("appr-1", "approve", { decidedBy: "user-owner-1" }, { sql, now: FIXED_NOW });
  assert.equal(result.status, "approved");
  assert.equal(sql.calls.length, 2, "one SELECT to fetch current state, one UPDATE to persist the transition");
  assert.match(sql.calls[1].text, /UPDATE approval_requests/);
});

test("integration: applyApprovalDecision refuses to approve an already-decided request (illegal transition)", async () => {
  const sql = fakeSql([pendingRow({ status: "approved" })]);
  await assert.rejects(() => applyApprovalDecision("appr-1", "approve", {}, { sql, now: FIXED_NOW }), /already terminal/);
  assert.equal(sql.calls.length, 1, "must not issue the UPDATE when the transition is denied");
});

test("integration: applyApprovalDecision refuses to approve an expired request", async () => {
  const sql = fakeSql([pendingRow({ expires_at: "2026-01-01T00:00:00.000Z" })]);
  await assert.rejects(() => applyApprovalDecision("appr-1", "approve", {}, { sql, now: FIXED_NOW }), /approval window has passed/);
});

test("applyApprovalDecision throws for a nonexistent approval id", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => applyApprovalDecision("nonexistent", "approve", {}, { sql, now: FIXED_NOW }), /no approval request/);
});

test("mapRowToApproval omits decision fields when not yet decided", () => {
  const mapped = mapRowToApproval(pendingRow());
  assert.equal("decidedAt" in mapped, false);
  assert.equal("decidedBy" in mapped, false);
});
