const test = require("node:test");
const assert = require("node:assert/strict");
const { createInitialScope, getScopeById, createNextScopeVersion, listScopeVersionsForTicket, mapRowToScope } = require("./scopeOfWorkStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "scope-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function scopeRow(overrides = {}) {
  return {
    id: "scope-1",
    organization_id: "org-a",
    ticket_id: "ticket-1",
    version: 1,
    status: "sent",
    assumptions: ["Standard access"],
    exclusions: ["Content writing"],
    line_items: [{ description: "Homepage redesign", quantity: 1, priceRef: "priceRef-1" }],
    created_at: "2026-07-01T00:00:00.000Z",
    created_by: "user-tech-1",
    ...overrides,
  };
}

test("createInitialScope validates and inserts version 1, status draft", async () => {
  const sql = fakeSql();
  const scope = await createInitialScope(
    { organizationId: "org-a", ticketId: "ticket-1", assumptions: [], exclusions: [], lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }], createdBy: "user-tech-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(scope.version, 1);
  assert.equal(scope.status, "draft");
  assert.match(sql.calls[0].text, /INSERT INTO scope_of_work/);
});

test("createInitialScope rejects a line item without a priceRef (no raw dollar amounts)", async () => {
  const sql = fakeSql();
  await assert.rejects(() =>
    createInitialScope({ organizationId: "org-a", ticketId: "ticket-1", lineItems: [{ description: "x", quantity: 1, priceRef: "" }], createdBy: "u" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID })
  );
  assert.equal(sql.calls.length, 0);
});

test("getScopeById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getScopeById("nope", { sql }), null);
});

// Integration: fetch-then-version through the pure scopeVersioning.js engine.
test("integration: createNextScopeVersion fetches, versions via scopeVersioning.js, and persists both rows", async () => {
  const sql = fakeSql([scopeRow({ status: "sent" })]);
  const newLineItems = [{ description: "Extra page", quantity: 1, priceRef: "priceRef-2" }];
  const next = await createNextScopeVersion("scope-1", { lineItems: newLineItems }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });

  assert.equal(next.version, 2);
  assert.equal(next.status, "draft");
  assert.deepEqual(next.lineItems, newLineItems);
  assert.equal(sql.calls.length, 3, "1 SELECT + 1 UPDATE (supersede old) + 1 INSERT (new version)");
  assert.match(sql.calls[1].text, /UPDATE scope_of_work/);
  assert.match(sql.calls[2].text, /INSERT INTO scope_of_work/);
});

test("integration: cannot version an already-superseded scope", async () => {
  const sql = fakeSql([scopeRow({ status: "superseded" })]);
  await assert.rejects(() => createNextScopeVersion("scope-1", {}, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }), /already superseded/);
});

test("createNextScopeVersion throws for a nonexistent scope", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => createNextScopeVersion("nope", {}, { sql, now: FIXED_NOW }), /no scope/);
});

test("listScopeVersionsForTicket orders by version", async () => {
  const sql = fakeSql([scopeRow({ version: 1, status: "superseded" }), scopeRow({ id: "scope-2", version: 2 })]);
  const versions = await listScopeVersionsForTicket("ticket-1", { sql });
  assert.equal(versions.length, 2);
  assert.match(sql.calls[0].text, /ORDER BY version/);
});

test("mapRowToScope defaults assumptions/exclusions to empty arrays", () => {
  const mapped = mapRowToScope(scopeRow({ assumptions: null, exclusions: null }));
  assert.deepEqual(mapped.assumptions, []);
  assert.deepEqual(mapped.exclusions, []);
});
