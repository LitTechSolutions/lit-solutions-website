// F046 -- Security Readiness Assessment. F047 -- Account Protection & MFA
// Checklist. Shared scoring engine: both are "plain-language checklist,
// weighted score" tools per their objectives, so F047 is modeled as a
// specific ChecklistDefinition passed through this same engine rather
// than a second implementation. The actual checklist ITEMS (what
// questions to ask) are business/security content Dylan should define
// (or the missing F046/F047 workbooks would have specified,
// OWNER_DECISIONS.md #10) -- not invented here.

const { assertValidChecklistDefinition, assertValidChecklistResponse } = require("../domain/readinessChecklist");

/**
 * @typedef {Object} ReadinessScore
 * @property {number} score - 0-1, weighted fraction of items met.
 * @property {string[]} unmetItemKeys
 * @property {string} summary - Plain-language, per SYS-NFR-016 ("a first-time customer can... without training").
 */

/**
 * @param {import("../domain/readinessChecklist").ChecklistDefinition} definition
 * @param {import("../domain/readinessChecklist").ChecklistResponse[]} responses
 * @returns {ReadinessScore}
 */
function scoreChecklist(definition, responses) {
  assertValidChecklistDefinition(definition);
  for (const response of responses) assertValidChecklistResponse(response);

  const responseByKey = new Map(responses.map((r) => [r.itemKey, r.met]));
  const totalWeight = definition.items.reduce((sum, item) => sum + item.weight, 0);

  let metWeight = 0;
  const unmetItemKeys = [];
  for (const item of definition.items) {
    const met = responseByKey.get(item.key) === true;
    if (met) {
      metWeight += item.weight;
    } else {
      unmetItemKeys.push(item.key);
    }
  }

  const score = totalWeight > 0 ? metWeight / totalWeight : 0;
  const summary =
    unmetItemKeys.length === 0
      ? `All ${definition.items.length} readiness items are in place.`
      : `${definition.items.length - unmetItemKeys.length} of ${definition.items.length} readiness items are in place.`;

  return { score, unmetItemKeys, summary };
}

module.exports = { scoreChecklist };
