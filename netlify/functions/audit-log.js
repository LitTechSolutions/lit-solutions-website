// audit-log.js -- HTTP endpoint for F008 (Audit Trail) viewing. Thin
// adapter over src/db/pgAuditSink.js's queryAuditEvents(): all filtering,
// keyset pagination, and row-shaping logic lives there, this file's only
// job is authenticating the caller, enforcing platform_admin-only access,
// validating query params, and auditing access to the audit log itself
// (Session 20 owner decision #7 -- "Audit access to the audit log
// itself").
//
// Routes:
//   GET /audit-log?organizationId=&actorId=&action=&dateFrom=&dateTo=&cursor=&limit=
//                             -- newest-first, cursor-paginated audit events
//                                (platform_admin only, audit.review)
//
// AuditEvent rows never contain secrets, auth material, or payment
// details by construction -- src/audit/auditLog.js's shapeAuditEvent()
// (F008) only ever accepts primitive metadata values, and no write() call
// anywhere in this codebase records a password, token, card number, or
// full auth header. This endpoint does not need its own redaction layer
// on top of that -- it would just be duplicating a guarantee that already
// exists at the point every audit event is created.

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createPgAuditSink } = require("../../src/db/pgAuditSink");
const { createAuditRecorder } = require("../../src/audit/auditLog");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "audit.review");
  if (deny) return deny;

  const q = event.queryStringParameters || {};
  const filters = {};
  if (q.organizationId) filters.organizationId = q.organizationId;
  if (q.actorId) filters.actorId = q.actorId;
  if (q.action) filters.action = q.action;
  if (q.cursor) filters.cursor = q.cursor;
  if (q.limit) {
    const limit = Number.parseInt(q.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) return json(400, { error: "limit must be a positive integer." });
    filters.limit = limit;
  }
  if (q.dateFrom) {
    if (Number.isNaN(Date.parse(q.dateFrom))) return json(400, { error: "dateFrom must be a valid ISO date." });
    filters.dateFrom = q.dateFrom;
  }
  if (q.dateTo) {
    if (Number.isNaN(Date.parse(q.dateTo))) return json(400, { error: "dateTo must be a valid ISO date." });
    filters.dateTo = q.dateTo;
  }

  const sink = deps.auditSink || createPgAuditSink({ sql: deps.sql });
  const { events, nextCursor } = await sink.queryAuditEvents(filters);

  const auditRecorder = deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
  await auditRecorder.record(
    {
      correlationId: auth.session.userId,
      actorType: "user",
      actorId: auth.session.userId,
      organizationId: filters.organizationId || null,
      action: "audit.query",
      targetType: "audit_log",
      targetId: null,
      outcome: "success",
      // metadata values must be primitives (SYS-SEC-012, enforced by
      // assertValidAuditEvent) -- flatten the filter set rather than
      // nesting it as an object, and never include the opaque cursor
      // value itself (it encodes a real row's occurred_at/id).
      metadata: {
        filterOrganizationId: filters.organizationId || null,
        filterActorId: filters.actorId || null,
        filterAction: filters.action || null,
        filterDateFrom: filters.dateFrom || null,
        filterDateTo: filters.dateTo || null,
        usedCursor: Boolean(filters.cursor),
        resultCount: events.length,
      },
    },
    deps
  );

  return json(200, { events, nextCursor });
};
