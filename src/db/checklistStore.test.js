const test = require("node:test");
const assert = require("node:assert/strict");
const { createChecklistDefinition, recordChecklistResponse, getChecklistScore } = require("./checklistStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "checklist-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

// Routes based on which table the query text mentions, so
// getChecklistScore's two parallel queries each get the right canned data.
function routingFakeSql(responsesByTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("checklist_definitions")) return responsesByTable.definitions || [];
    if (text.includes("checklist_responses")) return responsesByTable.responses || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

test("createChecklistDefinition validates and inserts", async () => {
  const sql = fakeSql();
  const definition = await createChecklistDefinition(
    { title: "Security Readiness", items: [{ key: "mfa_enabled", label: "MFA enabled?", weight: 2 }] },
    { sql, idGenerator: FIXED_ID }
  );
  assert.equal(definition.id, "checklist-fixed-id");
  assert.match(sql.calls[0].text, /INSERT INTO checklist_definitions/);
});

test("recordChecklistResponse rejects a non-boolean met value before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordChecklistResponse("org-a", "checklist-1", { itemKey: "mfa_enabled", met: "yes" }, { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 0);
});

test("recordChecklistResponse inserts a boolean-only response", async () => {
  const sql = fakeSql();
  await recordChecklistResponse("org-a", "checklist-1", { itemKey: "mfa_enabled", met: true }, { sql, now: FIXED_NOW });
  assert.match(sql.calls[0].text, /INSERT INTO checklist_responses/);
  assert.ok(sql.calls[0].values.includes(true));
});

// Integration: fetched definition + responses feed into the pure
// readinessChecklist.js scoring engine.
test("integration: getChecklistScore fetches and scores via readinessChecklist.js", async () => {
  const sql = routingFakeSql({
    definitions: [{ id: "checklist-1", title: "Security Readiness", items: [{ key: "mfa_enabled", label: "x", weight: 2 }, { key: "backups", label: "y", weight: 1 }] }],
    responses: [{ item_key: "mfa_enabled", met: true }],
  });
  const score = await getChecklistScore("org-a", "checklist-1", { sql });
  // mfa_enabled (weight 2) met, backups (weight 1) unmet -> 2/3
  assert.equal(score.score, 2 / 3);
  assert.deepEqual(score.unmetItemKeys, ["backups"]);
});

test("getChecklistScore throws for a nonexistent definition", async () => {
  const sql = routingFakeSql({ definitions: [], responses: [] });
  await assert.rejects(() => getChecklistScore("org-a", "nope", { sql }), /no checklist definition/);
});

// F047 reuse: same engine, different checklist content.
test("integration: F047 (MFA checklist) scores through the same engine as F046", async () => {
  const sql = routingFakeSql({
    definitions: [{ id: "mfa-checklist", title: "MFA", items: [{ key: "email_mfa", label: "x", weight: 1 }] }],
    responses: [{ item_key: "email_mfa", met: true }],
  });
  const score = await getChecklistScore("org-a", "mfa-checklist", { sql });
  assert.equal(score.score, 1);
});
