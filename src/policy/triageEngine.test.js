const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTicket, matchesRule } = require("./triageEngine");

const NOW = () => new Date("2026-07-14T12:00:00.000Z");

function ticket(overrides = {}) {
  return { id: "ticket-1", organizationId: "org-a", category: "website_change", subject: "x", description: "y", status: "submitted", submittedAt: "z", submittedBy: "u", updatedAt: "z", version: 1, ...overrides };
}

const SAMPLE_RULES = [
  { id: "rule-website", match: { category: "website_change" }, queue: "website-queue", priority: 1 },
  { id: "rule-it", match: { category: "it_support" }, queue: "it-queue", priority: 1 },
  { id: "rule-catchall", match: {}, queue: "general-queue", priority: 100 },
];

test("routes a ticket to the matching rule's queue", () => {
  const result = classifyTicket(SAMPLE_RULES, ticket({ category: "it_support" }), { now: NOW });
  assert.equal(result.queue, "it-queue");
  assert.equal(result.matchedRuleId, "rule-it");
});

test("falls through to a lower-priority catch-all rule when no specific rule matches", () => {
  const result = classifyTicket(SAMPLE_RULES, ticket({ category: "question" }), { now: NOW });
  assert.equal(result.queue, "general-queue");
});

test("evaluates rules in priority order (lower number first)", () => {
  const overlapping = [
    { id: "specific", match: { category: "website_change" }, queue: "specific-queue", priority: 1 },
    { id: "broad", match: {}, queue: "broad-queue", priority: 2 },
  ];
  const result = classifyTicket(overlapping, ticket({ category: "website_change" }), { now: NOW });
  assert.equal(result.queue, "specific-queue");
});

test("throws rather than silently defaulting when nothing matches and there's no catch-all", () => {
  const noCatchAll = [{ id: "rule-website", match: { category: "website_change" }, queue: "website-queue", priority: 1 }];
  assert.throws(() => classifyTicket(noCatchAll, ticket({ category: "it_support" }), { now: NOW }), /no triage rule matched/);
});

test("throws rather than guessing when no rules are configured at all", () => {
  assert.throws(() => classifyTicket([], ticket(), { now: NOW }), /no triage rules configured/);
});

test("matchesRule: empty match object matches any ticket (catch-all shape)", () => {
  assert.equal(matchesRule({ match: {} }, ticket()), true);
});

test("matchesRule: rejects when any matched field differs", () => {
  assert.equal(matchesRule({ match: { category: "it_support" } }, ticket({ category: "website_change" })), false);
});

test("rejects a malformed rule table (invalid rule shape)", () => {
  assert.throws(() => classifyTicket([{ id: "bad" }], ticket(), { now: NOW }));
});
