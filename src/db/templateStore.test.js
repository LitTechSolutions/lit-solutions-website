const test = require("node:test");
const assert = require("node:assert/strict");
const { createTemplateDefinition, renderTemplateByKey } = require("./templateStore");

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

test("createTemplateDefinition rejects a template referencing an undeclared variable, before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(
    () =>
      createTemplateDefinition(
        { key: "ticket_created", subject: "Hi {{customerName}}", body: "Internal note: {{secretField}}", allowedVariables: ["customerName"] },
        { sql, idGenerator: FIXED_ID }
      ),
    /undeclared variable/
  );
  assert.equal(sql.calls.length, 0);
});

test("createTemplateDefinition inserts a valid template", async () => {
  const sql = fakeSql();
  const definition = await createTemplateDefinition(
    { key: "ticket_created", subject: "Hi {{customerName}}", body: "We received your request.", allowedVariables: ["customerName"] },
    { sql, idGenerator: FIXED_ID }
  );
  assert.equal(definition.key, "ticket_created");
  assert.match(sql.calls[0].text, /INSERT INTO template_definitions/);
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
