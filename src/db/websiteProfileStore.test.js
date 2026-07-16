const test = require("node:test");
const assert = require("node:assert/strict");
const { createWebsiteProfile, listWebsiteProfilesForOrganization, updateWebsiteProfile, mapRowToWebsiteProfile } = require("./websiteProfileStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "profile-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

// Unlike fakeSql() (one canned result for every call), updateWebsiteProfile()
// issues a SELECT, then an UPDATE, then a second SELECT against the same
// table -- this returns each call's response in sequence (repeating the
// last one if there are more calls than responses) so a test can express
// "the row looked like *this* before the UPDATE, and *this* after."
function sequencedSql(responses) {
  const calls = [];
  let i = 0;
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    const response = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return response;
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function profileRow(overrides = {}) {
  return {
    id: "profile-1",
    organization_id: "org-a",
    primary_url: "https://example.com",
    domain_registrar: "GoDaddy",
    hosting_provider: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("createWebsiteProfile validates and inserts", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const profile = await createWebsiteProfile({ organizationId: "org-a", primaryUrl: "https://example.com" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder });
  assert.equal(profile.primaryUrl, "https://example.com");
  assert.match(sql.calls[0].text, /INSERT INTO website_profiles/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "website_profile.create");
  assert.equal(auditRecorder.events[0].actorId, "system");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
});

test("createWebsiteProfile audits with the given actorId", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await createWebsiteProfile({ organizationId: "org-a", primaryUrl: "https://example.com" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "admin-1" });
  assert.equal(auditRecorder.events[0].actorId, "admin-1");
});

test("createWebsiteProfile rejects an invalid URL before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => createWebsiteProfile({ organizationId: "org-a", primaryUrl: "not-a-url" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("listWebsiteProfilesForOrganization scopes by organization", async () => {
  const sql = fakeSql([{ id: "p1", organization_id: "org-a", primary_url: "https://example.com", domain_registrar: null, hosting_provider: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }]);
  const profiles = await listWebsiteProfilesForOrganization("org-a", { sql });
  assert.equal(profiles.length, 1);
});

test("mapRowToWebsiteProfile omits optional fields when null", () => {
  const mapped = mapRowToWebsiteProfile({ id: "p1", organization_id: "org-a", primary_url: "https://example.com", domain_registrar: null, hosting_provider: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" });
  assert.equal("domainRegistrar" in mapped, false);
});

test("updateWebsiteProfile changes only the provided fields and returns the re-fetched, mapped profile", async () => {
  const updatedRow = profileRow({ primary_url: "https://new.example.com", updated_at: "2026-07-14T12:00:00.000Z" });
  const sql = sequencedSql([[profileRow()], [updatedRow]]);
  const auditRecorder = fakeAuditRecorder();

  const profile = await updateWebsiteProfile("profile-1", { primaryUrl: "https://new.example.com" }, { sql, now: FIXED_NOW, auditRecorder, actorId: "admin-1" });

  assert.equal(profile.primaryUrl, "https://new.example.com");
  assert.equal(profile.domainRegistrar, "GoDaddy");
  assert.match(sql.calls[0].text, /SELECT \* FROM website_profiles WHERE id/);
  assert.match(sql.calls[1].text, /UPDATE website_profiles/);
  // The unsupplied fields are written back unchanged, not cleared.
  assert.ok(sql.calls[1].values.includes("GoDaddy"));
  assert.match(sql.calls[2].text, /SELECT \* FROM website_profiles WHERE id/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "website_profile.update");
  assert.equal(auditRecorder.events[0].actorId, "admin-1");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
  assert.equal(auditRecorder.events[0].targetId, "profile-1");
});

test("updateWebsiteProfile defaults the actor to system when none is supplied", async () => {
  const sql = sequencedSql([[profileRow()], [profileRow()]]);
  const auditRecorder = fakeAuditRecorder();
  await updateWebsiteProfile("profile-1", { hostingProvider: "Netlify" }, { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(auditRecorder.events[0].actorId, "system");
});

test("updateWebsiteProfile throws for a nonexistent website profile without auditing or updating", async () => {
  const sql = sequencedSql([[]]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => updateWebsiteProfile("nope", { primaryUrl: "https://x.com" }, { sql, now: FIXED_NOW, auditRecorder }), /no website profile/);
  assert.equal(auditRecorder.events.length, 0);
  assert.equal(sql.calls.length, 1);
});

test("updateWebsiteProfile rejects an invalid primaryUrl before writing", async () => {
  const sql = sequencedSql([[profileRow()]]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => updateWebsiteProfile("profile-1", { primaryUrl: "not-a-url" }, { sql, now: FIXED_NOW, auditRecorder }));
  assert.equal(auditRecorder.events.length, 0);
  // Only the initial fetch happened -- no UPDATE was issued.
  assert.equal(sql.calls.length, 1);
});
