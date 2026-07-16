// F055 -- Email & Communication Template Automation. Stores
// TemplateDefinition rows; rendering always goes through the existing
// pure src/templates/templateRenderer.js, never here -- this module's
// job is fetch-then-hand-to-renderTemplate(), so the two-way allowlist
// enforcement (template can't reference undeclared variables, caller
// can't supply undeclared ones) stays centralized in one place.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidTemplateDefinition, renderTemplate } = require("../templates/templateRenderer");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ key: string, subject: string, body: string, allowedVariables: string[] }} input
 * @param {{ sql?: Function, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../templates/templateRenderer").TemplateDefinition>}
 */
async function createTemplateDefinition(input, deps = {}) {
  const sql = deps.sql || getSql();
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const definition = { id: idGenerator(), ...input };
  assertValidTemplateDefinition(definition); // rejects undeclared-variable references in body/subject

  await sql`
    INSERT INTO template_definitions (id, key, subject, body, allowed_variables)
    VALUES (${definition.id}, ${definition.key}, ${definition.subject}, ${definition.body}, ${JSON.stringify(definition.allowedVariables)})
  `;

  await auditRecorder.record(
    {
      correlationId: definition.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: null,
      action: "template.create",
      targetType: "template_definition",
      targetId: definition.id,
      outcome: "success",
      metadata: { key: definition.key },
    },
    deps
  );

  return definition;
}

/**
 * Fetches a template by key and renders it -- fetch-then-render, the
 * allowlist enforcement happens entirely inside renderTemplate().
 *
 * @param {string} key
 * @param {Record<string, string>} variables
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ subject: string, body: string }>}
 */
async function renderTemplateByKey(key, variables, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM template_definitions WHERE key = ${key}`;
  if (rows.length === 0) {
    throw new Error(`renderTemplateByKey: no template with key "${key}"`);
  }
  const definition = { id: rows[0].id, key: rows[0].key, subject: rows[0].subject, body: rows[0].body, allowedVariables: rows[0].allowed_variables };
  return renderTemplate(definition, variables);
}

/**
 * Lists every template definition. Templates are global configuration,
 * not org-scoped (see this file's header comment) -- no WHERE clause.
 *
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../templates/templateRenderer").TemplateDefinition[]>}
 */
async function listTemplateDefinitions(deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM template_definitions`;
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    subject: row.subject,
    body: row.body,
    allowedVariables: row.allowed_variables,
  }));
}

module.exports = { createTemplateDefinition, renderTemplateByKey, listTemplateDefinitions };
