// Netlify Blobs-backed implementation of the AuditSink interface from
// auditLog.js. Reuses the existing store()/setJSON() wrapper from
// netlify/functions/_lib/blob_store.js rather than talking to
// @netlify/blobs directly, so this stays consistent with every other
// function's storage access pattern.
//
// New store: "audit_events", key = event.id. Same list()-scan-and-filter
// limitation as every other Blobs store in this codebase applies here too
// (see docs/development/DATA_MODEL.md) -- acceptable for Session 1, and a
// concrete instance of why the primary-data-store decision
// (OWNER_DECISIONS.md #1) matters more as audit volume grows: audit events
// are exactly the kind of high-volume, query-by-org/actor/date-range data
// that benefits most from real indexes.

const { setJSON, store } = require("../../netlify/functions/_lib/blob_store.js");

const AUDIT_STORE = "audit_events";

/**
 * @returns {import("./auditLog").AuditSink & { listByOrganization: (organizationId: string) => Promise<import("../domain/auditEvent").AuditEvent[]> }}
 */
function createBlobsAuditSink() {
  return {
    async write(event) {
      await setJSON(AUDIT_STORE, event.id, event);
    },
    // Full-scan-and-filter, matching every other cross-record query in this
    // codebase today. Fine at current expected Wave 1 volume; revisit once
    // real usage data exists, per the note above.
    async listByOrganization(organizationId) {
      const { blobs } = await store(AUDIT_STORE).list();
      const events = await Promise.all(
        blobs.map(async (entry) => {
          const raw = await store(AUDIT_STORE).get(entry.key, { type: "json" });
          return raw;
        })
      );
      return events.filter((event) => event && event.organizationId === organizationId);
    },
  };
}

module.exports = { createBlobsAuditSink, AUDIT_STORE };
