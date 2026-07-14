// F026 -- Scope of Work & Estimate Generation (versioning half). Pure
// version-history logic per SYS-NFR-011 ("versioned or contractual
// records are never silently overwritten") -- creating a new version
// never mutates the previous one, it marks it superseded and returns
// both records for the caller to persist together.

const crypto = require("node:crypto");
const { assertValidScopeOfWork } = require("../domain/scopeOfWork");

/**
 * @param {import("../domain/scopeOfWork").ScopeOfWork} previous
 * @param {Pick<import("../domain/scopeOfWork").ScopeOfWork, "assumptions" | "exclusions" | "lineItems">} updates
 * @param {{ now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {{ supersededPrevious: import("../domain/scopeOfWork").ScopeOfWork, next: import("../domain/scopeOfWork").ScopeOfWork }}
 */
function createNextVersion(previous, updates, deps = {}) {
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  assertValidScopeOfWork(previous);
  if (previous.status === "superseded") {
    throw new Error("createNextVersion: cannot version a scope that is already superseded -- version its successor instead");
  }

  const supersededPrevious = { ...previous, status: "superseded" };
  const next = {
    ...previous,
    ...updates,
    id: idGenerator(),
    version: previous.version + 1,
    status: "draft",
    createdAt: now().toISOString(),
  };
  assertValidScopeOfWork(next);

  return { supersededPrevious, next };
}

module.exports = { createNextVersion };
