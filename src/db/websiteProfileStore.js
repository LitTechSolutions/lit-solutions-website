// F031 -- Website Profile & Ownership Registry. Postgres persistence,
// same shape as organizationStore.js.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidWebsiteProfile } = require("../domain/websiteProfile");

/**
 * @param {{ organizationId: string, primaryUrl: string, domainRegistrar?: string, hostingProvider?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/websiteProfile").WebsiteProfile>}
 */
async function createWebsiteProfile(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

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
