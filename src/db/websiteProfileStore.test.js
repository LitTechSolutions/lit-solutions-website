const test = require("node:test");
const assert = require("node:assert/strict");
const { createWebsiteProfile, listWebsiteProfilesForOrganization, mapRowToWebsiteProfile } = require("./websiteProfileStore");

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

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
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
