// Shared Postgres (Neon) connection helper, mirroring the pattern already
// established by netlify/functions/_lib/blob_store.js: one place that
// knows how to get a client, everything else imports from here rather
// than constructing its own connection.
//
// Uses @neondatabase/serverless's HTTP-based driver specifically because
// Netlify Functions are stateless per-invocation -- a traditional
// connection-pooled driver (node-postgres) would exhaust Neon's
// connection limit under concurrent invocations. See DECISION_LOG.md's
// post-Session-9 entry for the full reasoning.
//
// No live Neon project exists in this environment -- getSql() is written
// and ready but has not been exercised against a real database. Requires
// DATABASE_URL (or NEON_DATABASE_URL) as a Netlify environment variable
// once a project is provisioned; see DEPLOYMENT_PLAN.md.

const { neon } = require("@neondatabase/serverless");

let cachedSql = null;

/**
 * @returns {import("@neondatabase/serverless").NeonQueryFunction<false, false>}
 */
function getSql() {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error("getSql: DATABASE_URL (or NEON_DATABASE_URL) is not set -- see docs/development/DEPLOYMENT_PLAN.md");
  }
  cachedSql = neon(connectionString);
  return cachedSql;
}

// Test-only escape hatch so adapter unit tests can inject a fake tagged-
// template function instead of hitting a real database. Never used by
// production code paths (those always call getSql()).
function resetCachedSqlForTests() {
  cachedSql = null;
}

module.exports = { getSql, resetCachedSqlForTests };
