// F031 -- Website Profile & Ownership Registry. Postgres persistence,
// same shape as organizationStore.js.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidWebsiteProfile } = require("../domain/websiteProfile");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, primaryUrl: string, domainRegistrar?: string, hostingProvider?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/websiteProfile").WebsiteProfile>}
 */
async function createWebsiteProfile(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const profile = {
    id: idGenerator(),
    organizationId: input.organizationId,
    primaryUrl: input.primaryUrl,
    ...(input.domainRegistrar ? { domainRegistrar: input.domainRegistrar } : {}),
    ...(input.hostingProvider ? { hostingProvider: input.hostingProvider } : {}),
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
  };
  assertValidWebsiteProfile(profile);

  await sql`
    INSERT INTO website_profiles (id, organization_id, primary_url, domain_registrar, hosting_provider, created_at, updated_at)
    VALUES (${profile.id}, ${profile.organizationId}, ${profile.primaryUrl}, ${profile.domainRegistrar || null}, ${profile.hostingProvider || null}, ${profile.createdAt}, ${profile.updatedAt})
  `;

  // No `domain` field in metadata: the only URL-shaped field on this
  // record is primaryUrl, which is unbounded and can carry query strings
  // / tokens -- per SYS-SEC-012 (no arbitrary/sensitive payloads in audit
  // metadata) it's left out rather than truncated or guessed at.
  await auditRecorder.record(
    {
      correlationId: profile.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: profile.organizationId,
      action: "website_profile.create",
      targetType: "website_profile",
      targetId: profile.id,
      outcome: "success",
    },
    deps
  );

  return profile;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/websiteProfile").WebsiteProfile[]>}
 */
async function listWebsiteProfilesForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM website_profiles WHERE organization_id = ${organizationId}`;
  return rows.map(mapRowToWebsiteProfile);
}

function mapRowToWebsiteProfile(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    primaryUrl: row.primary_url,
    ...(row.domain_registrar ? { domainRegistrar: row.domain_registrar } : {}),
    ...(row.hosting_provider ? { hostingProvider: row.hosting_provider } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

module.exports = { createWebsiteProfile, listWebsiteProfilesForOrganization, mapRowToWebsiteProfile };
