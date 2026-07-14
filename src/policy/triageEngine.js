// F020 -- Intelligent Ticket Triage & Service Routing. A rule-TABLE
// interpreter, not a source of business rules: the actual routing rules
// (which categories go to which queue) are business configuration, passed
// in by the caller (ultimately sourced from F056 settings once wired up),
// not hardcoded here. This keeps the engine testable and reusable without
// this module ever having to invent what Dylan's actual queues are.

const { assertValidTriageRule } = require("../domain/triage");

/**
 * @param {import("../domain/triage").TriageRule[]} rules
 * @param {import("../domain/ticket").Ticket} ticket
 * @param {{ now?: () => Date }} [deps]
 * @returns {import("../domain/triage").TriageResult}
 */
function classifyTicket(rules, ticket, deps = {}) {
  const now = deps.now || (() => new Date());
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error("classifyTicket: no triage rules configured -- refusing to guess a queue");
  }
  for (const rule of rules) assertValidTriageRule(rule);

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const matched = sortedRules.find((rule) => matchesRule(rule, ticket));

  if (!matched) {
    throw new Error(`classifyTicket: no triage rule matched ticket "${ticket.id}" -- add a catch-all rule rather than silently defaulting`);
  }

  return {
    ticketId: ticket.id,
    queue: matched.queue,
    matchedRuleId: matched.id,
    decidedAt: now().toISOString(),
  };
}

/**
 * @param {import("../domain/triage").TriageRule} rule
 * @param {import("../domain/ticket").Ticket} ticket
 * @returns {boolean}
 */
function matchesRule(rule, ticket) {
  return Object.entries(rule.match).every(([field, value]) => ticket[field] === value);
}

module.exports = { classifyTicket, matchesRule };
