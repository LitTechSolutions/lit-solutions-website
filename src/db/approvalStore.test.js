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

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
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
  const auditRecorder = fakeAuditRecorder();
  const approval = await createApprovalRequest(
    { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", requestedBy: "user-1", expiresAt: "2026-08-01T00:00:00.000Z" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID, actorId: "user-1", auditRecorder }
  );
  assert.equal(approval.status, "pending");
  assert.match(sql.calls[0].text, /INSERT INTO approval_requests/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "approval.create");
  assert.equal(auditRecorder.events[0].actorId, "user-1");
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
  const auditRecorder = fakeAuditRecorder();
  const result = await applyApprovalDecision(
    "appr-1",
    "approve",
    { decidedBy: "user-owner-1", organizationId: "org-a" },
    { sql, now: FIXED_NOW, actorId: "user-owner-1", auditRecorder }
  );
  assert.equal(result.status, "approved");
  assert.equal(sql.calls.length, 2, "one SELECT to fetch current state, one UPDATE to persist the transition");
  assert.match(sql.calls[0].text, /organization_id/, "the fetch must be scoped by organization_id, not id alone");
  assert.match(sql.calls[1].text, /WITH changed AS/);
  assert.match(sql.calls[1].text, /UPDATE approval_requests/);
  assert.match(sql.calls[1].text, /organization_id/, "the UPDATE's WHERE clause must also be scoped by organization_id");
  assert.match(sql.calls[1].text, /status = 'pending'/, "the atomic write must reject a concurrent second decision");
  assert.match(sql.calls[1].text, /INSERT INTO audit_events/, "the success audit must be part of the same SQL statement");
  assert.match(sql.calls[1].text, /INNER JOIN audited/, "a transition is only returned when its audit insert also succeeds");
  assert.equal(auditRecorder.events.length, 0, "the decision audit is written atomically in SQL, not as a second call");
});

test("SECURITY: applyApprovalDecision fails when the atomic conditional update loses a race", async () => {
  const calls = [];
  let invocation = 0;
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    invocation += 1;
    return invocation === 1 ? [pendingRow()] : [];
  };

  await assert.rejects(
    () => applyApprovalDecision("appr-1", "approve", { organizationId: "org-a" }, { sql, now: FIXED_NOW }),
    /already decided, expired, or changed by another request/
  );
  assert.equal(calls.length, 2);
  assert.match(calls[1].text, /status = 'pending'/);
});

test("integration: applyApprovalDecision refuses to approve an already-decided request (illegal transition)", async () => {
  const sql = fakeSql([pendingRow({ status: "approved" })]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(
    () => applyApprovalDecision("appr-1", "approve", { organizationId: "org-a" }, { sql, now: FIXED_NOW, auditRecorder }),
    /already terminal/
  );
  assert.equal(sql.calls.length, 1, "must not issue the UPDATE when the transition is denied");
  assert.equal(auditRecorder.events.length, 0, "must not audit a denied transition");
});

test("integration: applyApprovalDecision refuses to approve an expired request", async () => {
  const sql = fakeSql([pendingRow({ expires_at: "2026-01-01T00:00:00.000Z" })]);
  await assert.rejects(
    () => applyApprovalDecision("appr-1", "approve", { organizationId: "org-a" }, { sql, now: FIXED_NOW, auditRecorder: fakeAuditRecorder() }),
    /approval window has passed/
  );
});

test("applyApprovalDecision throws for a nonexistent approval id", async () => {
  const sql = fakeSql([]);
  await assert.rejects(
    () => applyApprovalDecision("nonexistent", "approve", { organizationId: "org-a" }, { sql, now: FIXED_NOW, auditRecorder: fakeAuditRecorder() }),
    /no approval request/
  );
});

test("applyApprovalDecision requires decision.organizationId -- never falls back to trusting the bare id", async () => {
  const sql = fakeSql([pendingRow()]);
  await assert.rejects(
    () => applyApprovalDecision("appr-1", "approve", {}, { sql, now: FIXED_NOW, auditRecorder: fakeAuditRecorder() }),
    /organizationId is required/
  );
});

// Regression test for the cross-tenant IDOR found via independent review
// (Session 20 post-step-8): an org_owner authenticated for "org-a" must
// never be able to read or mutate an approval that actually belongs to
// "org-b", even if they know/guess its id.
test("SECURITY: applyApprovalDecision rejects an approval that belongs to a different organization than the caller's authorized one", async () => {
  // The fake sql adapter can't filter by WHERE clause itself, so this
  // proves the query INCLUDES organization_id in its predicate (the real
  // Postgres driver enforces the actual filtering) -- see the
  // "must be scoped by organization_id" assertions above for the SQL-text
  // proof; this test proves the call fails closed when the query legitimately
  // returns zero rows (the real-world outcome for a mismatched org).
  const sql = fakeSql([]); // simulates: no row matches id AND organization_id together
  await assert.rejects(
    () => applyApprovalDecision("appr-owned-by-org-b", "approve", { organizationId: "org-a" }, { sql, now: FIXED_NOW, auditRecorder: fakeAuditRecorder() }),
    /no approval request/,
    "must throw the same not-found-shaped error as a genuinely missing id -- never reveal that the id exists in another organization"
  );
});

test("SECURITY: applyApprovalDecision rejects a subjectType that doesn't match the stored approval's real subjectType", async () => {
  const sql = fakeSql([pendingRow({ subject_type: "scope" })]);
  await assert.rejects(
    () =>
      applyApprovalDecision(
        "appr-1",
        "approve",
        { organizationId: "org-a", subjectType: "change_order" },
        { sql, now: FIXED_NOW, auditRecorder: fakeAuditRecorder() }
      ),
    /no approval request/,
    "a caller claiming the wrong subjectType (to route through a different RBAC capability check) must be rejected, not silently approved"
  );
});

test("mapRowToApproval omits decision fields when not yet decided", () => {
  const mapped = mapRowToApproval(pendingRow());
  assert.equal("decidedAt" in mapped, false);
  assert.equal("decidedBy" in mapped, false);
});
