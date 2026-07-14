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

test("integration: classifies via itSupportClassification.js and persists the result", async () => {
  const sql = fakeSql();
  const result = await recordItSupportClassification("ticket-1", { requiresPhysicalAccess: true, safetyRisk: false }, { sql, now: FIXED_NOW });
  assert.equal(result.classification, "on_site");
  assert.match(sql.calls[0].text, /INSERT INTO it_support_classifications/);
});

test("integration: a safety risk persists as safety_conscious even with physical access", async () => {
  const sql = fakeSql();
  const result = await recordItSupportClassification("ticket-1", { requiresPhysicalAccess: true, safetyRisk: true }, { sql, now: FIXED_NOW });
  assert.equal(result.classification, "safety_conscious");
});

test("propagates classifyHandling's validation error for malformed signals", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordItSupportClassification("ticket-1", { requiresPhysicalAccess: "yes" }, { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 0);
});
