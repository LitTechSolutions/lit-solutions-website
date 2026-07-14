// F046 (Security Readiness) & F047 (Account Protection & MFA Checklist)
// -- one persistence module for both, mirroring the Session 5 decision
// that they share a single scoring engine (src/policy/readinessChecklist.js).
// Responses stay boolean-only end to end (SYS-SEC-014-adjacent: no
// credential/secret storage) -- assertValidChecklistResponse enforces
// this before any write.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidChecklistDefinition, assertValidChecklistResponse } = require("../domain/readinessChecklist");
const { scoreChecklist } = require("../policy/readinessChecklist");

/**
 * @param {{ title: string, items: import("../domain/readinessChecklist").ChecklistItem[] }} input
 * @param {{ sql?: Function, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/readinessChecklist").ChecklistDefinition>}
 */
async function createChecklistDefinition(input, deps = {}) {
  const sql = deps.sql || getSql();
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const definition = { id: idGenerator(), title: input.title, items: input.items };
  assertValidChecklistDefinition(definition);

  await sql`
    INSERT INTO checklist_definitions (id, title, items)
    VALUES (${definition.id}, ${definition.title}, ${JSON.stringify(definition.items)})
  `;
  return definition;
}

/**
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {import("../domain/readinessChecklist").ChecklistResponse} response
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<void>}
 */
async function recordChecklistResponse(organizationId, checklistDefinitionId, response, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  assertValidChecklistResponse(response);

  await sql`
    INSERT INTO checklist_responses (id, organization_id, checklist_definition_id, item_key, met, recorded_at)
    VALUES (${crypto.randomUUID()}, ${organizationId}, ${checklistDefinitionId}, ${response.itemKey}, ${response.met}, ${now().toISOString()})
    ON CONFLICT (organization_id, checklist_definition_id, item_key) DO UPDATE SET met = EXCLUDED.met, recorded_at = EXCLUDED.recorded_at
  `;
}

/**
 * Fetches the definition and an organization's responses, then scores
 * through the pure readinessChecklist.js engine -- this module never
 * computes a score itself.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../policy/readinessChecklist").ReadinessScore>}
 */
async function getChecklistScore(organizationId, checklistDefinitionId, deps = {}) {
  const sql = deps.sql || getSql();
  const [definitionRows, responseRows] = await Promise.all([
    sql`SELECT * FROM checklist_definitions WHERE id = ${checklistDefinitionId}`,
    sql`SELECT item_key, met FROM checklist_responses WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}`,
  ]);
  if (definitionRows.length === 0) {
    throw new Error(`getChecklistScore: no checklist definition "${checklistDefinitionId}"`);
  }
  const definition = { id: definitionRows[0].id, title: definitionRows[0].title, items: definitionRows[0].items };
  const responses = responseRows.map((row) => ({ itemKey: row.item_key, met: row.met }));
  return scoreChecklist(definition, responses);
}

module.exports = { createChecklistDefinition, recordChecklistResponse, getChecklistScore };
