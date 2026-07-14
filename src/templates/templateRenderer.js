// F055 -- Email & Communication Template Automation. Safe variable
// substitution: a template declares its own `allowedVariables` allowlist,
// and this engine refuses to render if the template body references an
// undeclared variable OR if the caller supplies a variable the template
// didn't declare -- directly implementing "without allowing templates to
// leak data" (F055's objective) as a structural check, not a review
// guideline. Actual template COPY (subject lines, body wording) is
// business content Dylan should write/approve, not generated here.

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * @typedef {Object} TemplateDefinition
 * @property {string} id
 * @property {string} key - e.g. "ticket_created", "invitation_sent".
 * @property {string} subject
 * @property {string} body
 * @property {string[]} allowedVariables
 */

/**
 * @param {Partial<TemplateDefinition>} candidate
 * @returns {asserts candidate is TemplateDefinition}
 */
function assertValidTemplateDefinition(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("templateDefinition: expected an object");
  if (typeof candidate.key !== "string" || candidate.key.length === 0) throw new Error("templateDefinition: key is required");
  if (typeof candidate.subject !== "string" || candidate.subject.length === 0) throw new Error("templateDefinition: subject is required");
  if (typeof candidate.body !== "string" || candidate.body.length === 0) throw new Error("templateDefinition: body is required");
  if (!Array.isArray(candidate.allowedVariables)) throw new Error("templateDefinition: allowedVariables must be an array");

  for (const text of [candidate.subject, candidate.body]) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      const variableName = match[1];
      if (!candidate.allowedVariables.includes(variableName)) {
        throw new Error(`templateDefinition: references undeclared variable "{{${variableName}}}" -- add it to allowedVariables or remove it (prevents accidental data leaks)`);
      }
    }
  }
}

/**
 * @param {TemplateDefinition} definition
 * @param {Record<string, string>} variables
 * @returns {{ subject: string, body: string }}
 */
function renderTemplate(definition, variables) {
  assertValidTemplateDefinition(definition);

  for (const key of Object.keys(variables)) {
    if (!definition.allowedVariables.includes(key)) {
      throw new Error(`renderTemplate: caller supplied variable "${key}" that template "${definition.key}" did not declare -- refusing to render (prevents leaking data the template wasn't designed to show)`);
    }
  }
  for (const requiredKey of definition.allowedVariables) {
    if (!(requiredKey in variables)) {
      throw new Error(`renderTemplate: missing required variable "${requiredKey}" for template "${definition.key}"`);
    }
  }

  const substitute = (text) => text.replace(PLACEHOLDER_PATTERN, (_match, variableName) => String(variables[variableName]));

  return { subject: substitute(definition.subject), body: substitute(definition.body) };
}

module.exports = { renderTemplate, assertValidTemplateDefinition };
