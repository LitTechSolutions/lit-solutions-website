const test = require("node:test");
const assert = require("node:assert/strict");
const { recordItSupportClassification } = require("./itSupportStore");

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

test("integration: classifies via itSupportClassification.js and persists the result", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const result = await recordItSupportClassification("ticket-1", { requiresPhysicalAccess: true, safetyRisk: false }, { sql, now: FIXED_NOW, auditRecorder, actorId: "tech-1" });
  assert.equal(result.classification, "on_site");
  assert.match(sql.calls[0].text, /INSERT INTO it_support_classifications/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "it_support.classify");
  assert.equal(auditRecorder.events[0].actorId, "tech-1");
});

test("integration: a safety risk persists as safety_conscious even with physical access", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const result = await recordItSupportClassification("ticket-1", { requiresPhysicalAccess: true, safetyRisk: true }, { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.classification, "safety_conscious");
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "it_support.classify");
  assert.equal(auditRecorder.events[0].actorId, "system");
});

test("propagates classifyHandling's validation error for malformed signals", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => recordItSupportClassification("ticket-1", { requiresPhysicalAccess: "yes" }, { sql, now: FIXED_NOW, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});
