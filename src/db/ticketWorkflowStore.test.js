const test = require("node:test");
const assert = require("node:assert/strict");
const { recordTriageResult, recordPriorityAssessment, recordAssignment, getAssignedTechnician } = require("./ticketWorkflowStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");

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

function ticket(overrides = {}) {
  return { id: "ticket-1", organizationId: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submittedAt: "z", submittedBy: "u", updatedAt: "z", version: 1, ...overrides };
}

test("integration: recordTriageResult classifies via triageEngine.js, persists the result, and audits the actor", async () => {
  const rules = [{ id: "rule-it", match: { category: "it_support" }, queue: "it-queue", priority: 1 }];
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const result = await recordTriageResult(rules, ticket(), "admin-1", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.queue, "it-queue");
  assert.match(sql.calls[0].text, /INSERT INTO triage_results/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "ticket.triage");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
  assert.equal(auditRecorder.events[0].actorId, "admin-1");
});

test("recordTriageResult propagates classifyTicket's throw when nothing matches, without auditing", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => recordTriageResult([], ticket(), "admin-1", { sql, now: FIXED_NOW, auditRecorder }), /no triage rules configured/);
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("integration: recordPriorityAssessment scores via priorityScoring.js, persists it, and audits the actor", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const assessment = await recordPriorityAssessment(
    "ticket-1",
    { impact: 0.9, urgency: 0.9, safetyConcern: false, securityConcern: false },
    "org-a",
    "admin-1",
    { sql, now: FIXED_NOW, auditRecorder }
  );
  assert.equal(assessment.level, "critical");
  assert.match(sql.calls[0].text, /INSERT INTO priority_assessments/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "ticket.prioritize");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
});

test("integration: a safety concern forces critical priority through the full persistence path", async () => {
  const sql = fakeSql();
  const assessment = await recordPriorityAssessment("ticket-1", { impact: 0.1, urgency: 0.1, safetyConcern: true, securityConcern: false }, "org-a", "admin-1", { sql, now: FIXED_NOW });
  assert.equal(assessment.level, "critical");
});

test("integration: recordAssignment selects via assignmentQueue.js, persists it, and audits the actor", async () => {
  const candidates = [{ userId: "tech-1", organizationAssignments: ["org-a"], openTicketCount: 0, available: true }];
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const assignment = await recordAssignment(candidates, "org-a", "ticket-1", "user-admin-1", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(assignment.technicianUserId, "tech-1");
  assert.match(sql.calls[0].text, /INSERT INTO assignments/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "ticket.assign");
  assert.equal(auditRecorder.events[0].actorId, "user-admin-1");
});

test("recordAssignment throws rather than persisting a null assignment when no technician is eligible", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordAssignment([], "org-a", "ticket-1", "user-admin-1", { sql, now: FIXED_NOW }), /no available technician/);
  assert.equal(sql.calls.length, 0);
});

test("getAssignedTechnician returns the technician_user_id when a ticket is assigned", async () => {
  const sql = fakeSql([{ technician_user_id: "tech-1" }]);
  assert.equal(await getAssignedTechnician("ticket-1", { sql }), "tech-1");
});

test("getAssignedTechnician returns null for an unassigned ticket -- never treat 'no row' as 'assigned'", async () => {
  const sql = fakeSql([]);
  assert.equal(await getAssignedTechnician("ticket-1", { sql }), null);
});
