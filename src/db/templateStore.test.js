const test = require("node:test");
const assert = require("node:assert/strict");
const { createTemplateDefinition, renderTemplateByKey, listTemplateDefinitions } = require("./templateStore");

const FIXED_ID = () => "template-fixed-id";

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

test("createTemplateDefinition rejects a template referencing an undeclared variable, before querying", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(
    () =>
      createTemplateDefinition(
        { key: "ticket_created", subject: "Hi {{customerName}}", body: "Internal note: {{secretField}}", allowedVariables: ["customerName"] },
        { sql, idGenerator: FIXED_ID, auditRecorder }
      ),
    /undeclared variable/
  );
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("createTemplateDefinition inserts a valid template", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const definition = await createTemplateDefinition(
    { key: "ticket_created", subject: "Hi {{customerName}}", body: "We received your request.", allowedVariables: ["customerName"] },
    { sql, idGenerator: FIXED_ID, actorId: "user-admin-1", auditRecorder }
  );
  assert.equal(definition.key, "ticket_created");
  assert.match(sql.calls[0].text, /INSERT INTO template_definitions/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "template.create");
  assert.equal(auditRecorder.events[0].actorId, "user-admin-1");
  assert.equal(auditRecorder.events[0].organizationId, null);
});

// Integration: fetch-then-render through the pure templateRenderer.js,
// including its two-way allowlist enforcement.
test("integration: renderTemplateByKey fetches and renders via templateRenderer.js", async () => {
  const sql = fakeSql([{ id: "t1", key: "ticket_created", subject: "Hi {{customerName}}", body: "We received your request, {{customerName}}.", allowed_variables: ["customerName"] }]);
  const result = await renderTemplateByKey("ticket_created", { customerName: "Jamie" }, { sql });
  assert.equal(result.subject, "Hi Jamie");
});

test("integration: renderTemplateByKey still refuses an undeclared caller-supplied variable", async () => {
  const sql = fakeSql([{ id: "t1", key: "ticket_created", subject: "Hi {{customerName}}", body: "x", allowed_variables: ["customerName"] }]);
  await assert.rejects(() => renderTemplateByKey("ticket_created", { customerName: "Jamie", internalNote: "leak" }, { sql }), /did not declare/);
});

test("renderTemplateByKey throws for an unknown key", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => renderTemplateByKey("nonexistent", {}, { sql }), /no template with key/);
});

test("listTemplateDefinitions queries without a WHERE clause -- templates are global, not org-scoped", async () => {
  const sql = fakeSql([
    { id: "t1", key: "ticket_created", subject: "Hi {{customerName}}", body: "Body", allowed_variables: ["customerName"] },
    { id: "t2", key: "no_vars", subject: "Subject", body: "Body", allowed_variables: [] },
  ]);
  const definitions = await listTemplateDefinitions({ sql });
  assert.equal(definitions.length, 2);
  assert.deepEqual(definitions[0], { id: "t1", key: "ticket_created", subject: "Hi {{customerName}}", body: "Body", allowedVariables: ["customerName"] });
  assert.deepEqual(definitions[1].allowedVariables, []);
  assert.match(sql.calls[0].text, /SELECT \* FROM template_definitions/);
  assert.doesNotMatch(sql.calls[0].text, /WHERE/);
});

test("listTemplateDefinitions returns an empty array when no templates exist", async () => {
  const sql = fakeSql([]);
  assert.deepEqual(await listTemplateDefinitions({ sql }), []);
});
