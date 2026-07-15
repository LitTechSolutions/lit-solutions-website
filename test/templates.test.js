const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/templates");

const FIXED_ID = () => "tpl-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("template_definitions")) return byTable.templates || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

test("POST as admin creates a template definition", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ key: "welcome", subject: "Welcome, {{name}}", body: "Hi {{name}}", allowedVariables: ["name"] }) },
    {},
    { ...fakeDeps("admin"), sql, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ key: "x", subject: "y", body: "z", allowedVariables: [] }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("GET as admin renders a template by key", async () => {
  const sql = routingFakeSql({ templates: [{ id: "tpl-1", key: "welcome", subject: "Welcome, {{name}}", body: "Hi {{name}}", allowed_variables: ["name"] }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { key: "welcome", name: "Dylan" } },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).subject, "Welcome, Dylan");
});

test("GET for an unknown key returns 404", async () => {
  const sql = routingFakeSql({ templates: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { key: "nope" } },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
