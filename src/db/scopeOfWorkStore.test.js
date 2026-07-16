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

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
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
  const auditRecorder = fakeAuditRecorder();
  const scope = await createInitialScope(
    { organizationId: "org-a", ticketId: "ticket-1", assumptions: [], exclusions: [], lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }], createdBy: "user-tech-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID, actorId: "user-tech-1", auditRecorder }
  );
  assert.equal(scope.version, 1);
  assert.equal(scope.status, "draft");
  assert.match(sql.calls[0].text, /INSERT INTO scope_of_work/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "scope.create");
  assert.equal(auditRecorder.events[0].actorId, "user-tech-1");
});

test("createInitialScope rejects a line item without a priceRef (no raw dollar amounts)", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() =>
    createInitialScope(
      { organizationId: "org-a", ticketId: "ticket-1", lineItems: [{ description: "x", quantity: 1, priceRef: "" }], createdBy: "u" },
      { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }
    )
  );
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("getScopeById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getScopeById("nope", { sql }), null);
});

// Integration: fetch-then-version through the pure scopeVersioning.js engine.
test("integration: createNextScopeVersion fetches, versions via scopeVersioning.js, and persists both rows in one atomic statement", async () => {
  const selectRows = [scopeRow({ status: "sent" })];
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return calls.length === 1 ? selectRows : [{ id: "scope-1" }];
  };
  sql.calls = calls;
  const newLineItems = [{ description: "Extra page", quantity: 1, priceRef: "priceRef-2" }];
  const next = await createNextScopeVersion("scope-1", { lineItems: newLineItems }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, actorId: "user-tech-1" });

  assert.equal(next.version, 2);
  assert.equal(next.status, "draft");
  assert.deepEqual(next.lineItems, newLineItems);
  assert.equal(sql.calls.length, 2, "1 SELECT (fetch current) + 1 combined UPDATE/INSERT/audit statement");
  assert.match(sql.calls[1].text, /WITH superseded AS/);
  assert.match(sql.calls[1].text, /UPDATE scope_of_work/);
  assert.match(sql.calls[1].text, /INSERT INTO scope_of_work/);
  assert.match(sql.calls[1].text, /INSERT INTO audit_events/);
});

test("integration: cannot version an already-superseded scope", async () => {
  const sql = fakeSql([scopeRow({ status: "superseded" })]);
  await assert.rejects(() => createNextScopeVersion("scope-1", {}, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }), /already superseded/);
  assert.equal(sql.calls.length, 1, "the pure-function rejection fires before any write is attempted");
});

test("createNextScopeVersion throws for a nonexistent scope", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => createNextScopeVersion("nope", {}, { sql, now: FIXED_NOW }), /no scope/);
});

test("integration: a concurrent version request racing the same scope loses cleanly", async () => {
  // Simulates another request having already superseded (or re-versioned)
  // this exact scope between our SELECT and our write -- the combined
  // statement's UPDATE matches no row, so every downstream CTE is empty
  // and the write returns zero rows instead of silently double-versioning.
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return calls.length === 1 ? [scopeRow({ status: "sent" })] : [];
  };
  sql.calls = calls;
  await assert.rejects(
    () => createNextScopeVersion("scope-1", {}, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }),
    /versioned or superseded by another request/
  );
});

test("listScopeVersionsForTicket orders by version and scopes the query by organizationId", async () => {
  const sql = fakeSql([scopeRow({ version: 1, status: "superseded" }), scopeRow({ id: "scope-2", version: 2 })]);
  const versions = await listScopeVersionsForTicket("ticket-1", "org-a", { sql });
  assert.equal(versions.length, 2);
  assert.match(sql.calls[0].text, /ORDER BY version/);
  assert.match(
    sql.calls[0].text,
    /organization_id/,
    "SECURITY regression (Session 20 post-step-8): must be scoped by organizationId, not ticketId alone -- otherwise a caller authenticated for one org could read another org's scope-of-work versions for a guessed ticketId"
  );
});

test("mapRowToScope defaults assumptions/exclusions to empty arrays", () => {
  const mapped = mapRowToScope(scopeRow({ assumptions: null, exclusions: null }));
  assert.deepEqual(mapped.assumptions, []);
  assert.deepEqual(mapped.exclusions, []);
});
