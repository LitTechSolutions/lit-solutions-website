const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrganization, getOrganizationById, updateOrganizationStatus, mapRowToOrganization } = require("./organizationStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "org-fixed-id";

// Fake tagged-template sql function mimicking @neondatabase/serverless's
// call shape (strings array + values) closely enough to test our query
// construction and parameter passing without a live database. Records
// every call for assertions and returns a caller-supplied canned result.
function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

test("createOrganization validates and inserts, returning the created record", async () => {
  const sql = fakeSql();
  const org = await createOrganization({ name: "Acme Co", createdBy: "user-1" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });

  assert.equal(org.id, "org-fixed-id");
  assert.equal(org.name, "Acme Co");
  assert.equal(org.status, "active");
  assert.equal(org.version, 1);
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /INSERT INTO organizations/);
  assert.ok(sql.calls[0].values.includes("Acme Co"));
});

test("createOrganization rejects an invalid name before ever touching the database", async () => {
  const sql = fakeSql();
  await assert.rejects(() => createOrganization({ name: "", createdBy: "user-1" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0, "must not issue a query for invalid input");
});

test("getOrganizationById returns null when no row matches", async () => {
  const sql = fakeSql([]);
  const result = await getOrganizationById("nonexistent", { sql });
  assert.equal(result, null);
});

test("getOrganizationById maps a returned row back to the domain shape", async () => {
  const sql = fakeSql([
    {
      id: "org-1",
      name: "Acme Co",
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      created_by: "user-1",
      version: 1,
    },
  ]);
  const result = await getOrganizationById("org-1", { sql });
  assert.equal(result.id, "org-1");
  assert.equal(result.createdBy, "user-1");
});

test("updateOrganizationStatus rejects an invalid status without querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => updateOrganizationStatus("org-1", "bogus", { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 0);
});

test("updateOrganizationStatus issues an UPDATE with the new status", async () => {
  const sql = fakeSql();
  await updateOrganizationStatus("org-1", "suspended", { sql, now: FIXED_NOW });
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /UPDATE organizations/);
  assert.ok(sql.calls[0].values.includes("suspended"));
});

test("mapRowToOrganization normalizes timestamps to ISO strings", () => {
  const mapped = mapRowToOrganization({
    id: "org-1",
    name: "Acme",
    status: "active",
    created_at: new Date("2026-07-01T00:00:00.000Z"),
    updated_at: new Date("2026-07-01T00:00:00.000Z"),
    created_by: "user-1",
    version: 2,
  });
  assert.equal(mapped.createdAt, "2026-07-01T00:00:00.000Z");
  assert.equal(mapped.version, 2);
});
