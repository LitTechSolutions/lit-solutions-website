const test = require("node:test");
const assert = require("node:assert/strict");
const { recordTriageResult, recordPriorityAssessment, recordAssignment } = require("./ticketWorkflowStore");

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

function ticket(overrides = {}) {
  return { id: "ticket-1", organizationId: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submittedAt: "z", submittedBy: "u", updatedAt: "z", version: 1, ...overrides };
}

test("integration: recordTriageResult classifies via triageEngine.js and persists the result", async () => {
  const rules = [{ id: "rule-it", match: { category: "it_support" }, queue: "it-queue", priority: 1 }];
  const sql = fakeSql();
  const result = await recordTriageResult(rules, ticket(), { sql, now: FIXED_NOW });
  assert.equal(result.queue, "it-queue");
  assert.match(sql.calls[0].text, /INSERT INTO triage_results/);
});

test("recordTriageResult propagates classifyTicket's throw when nothing matches", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordTriageResult([], ticket(), { sql, now: FIXED_NOW }), /no triage rules configured/);
  assert.equal(sql.calls.length, 0);
});

test("integration: recordPriorityAssessment scores via priorityScoring.js and persists it", async () => {
  const sql = fakeSql();
  const assessment = await recordPriorityAssessment(
    "ticket-1",
    { impact: 0.9, urgency: 0.9, safetyConcern: false, securityConcern: false },
    { sql, now: FIXED_NOW }
  );
  assert.equal(assessment.level, "critical");
  assert.match(sql.calls[0].text, /INSERT INTO priority_assessments/);
});

test("integration: a safety concern forces critical priority through the full persistence path", async () => {
  const sql = fakeSql();
  const assessment = await recordPriorityAssessment("ticket-1", { impact: 0.1, urgency: 0.1, safetyConcern: true, securityConcern: false }, { sql, now: FIXED_NOW });
  assert.equal(assessment.level, "critical");
});

test("integration: recordAssignment selects via assignmentQueue.js and persists it", async () => {
  const candidates = [{ userId: "tech-1", organizationAssignments: ["org-a"], openTicketCount: 0, available: true }];
  const sql = fakeSql();
  const assignment = await recordAssignment(candidates, "org-a", "ticket-1", "user-admin-1", { sql, now: FIXED_NOW });
  assert.equal(assignment.technicianUserId, "tech-1");
  assert.match(sql.calls[0].text, /INSERT INTO assignments/);
});

test("recordAssignment throws rather than persisting a null assignment when no technician is eligible", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordAssignment([], "org-a", "ticket-1", "user-admin-1", { sql, now: FIXED_NOW }), /no available technician/);
  assert.equal(sql.calls.length, 0);
});
