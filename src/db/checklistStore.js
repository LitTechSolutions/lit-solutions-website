// F046 (Security Readiness) & F047 (Account Protection & MFA Checklist)
// -- one persistence module for both, mirroring the Session 5 decision
// that they share a single scoring engine (src/policy/readinessChecklist.js).
// Responses stay boolean-only end to end (SYS-SEC-014-adjacent: no
// credential/secret storage) -- assertValidChecklistItemAnswer enforces
// this before any write.
//
// Session 20 owner decision #3 redesign: checklist data now splits into
// customer-editable answers/comments vs. staff-only notes/verification
// (see src/domain/readinessChecklist.js's ChecklistItemAnswer), plus a
// real submission workflow (draft -> submitted -> returned/verified,
// src/policy/checklistSubmissionWorkflow.js) so "Submitted for review"
// and staff sign-off are real, auditable states. Every write records an
// audit event (SYS-NFR-020), following the resolveAuditRecorder(deps)
// pattern established in invitationStore.js/ticketStore.js.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidChecklistDefinition, assertValidChecklistItemAnswer } = require("../domain/readinessChecklist");
const { scoreChecklist } = require("../policy/readinessChecklist");
const { transitionChecklistSubmission, canCustomerEdit } = require("../policy/checklistSubmissionWorkflow");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

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
 * Checklist definitions are global (not org-scoped) configuration -- see
 * createChecklistDefinition's module comment. Without a listing, nothing
 * (customer UI or staff) has any way to discover which checklist(s)
 * exist to complete/assess at all -- getChecklistDefinition() only
 * works if the caller already knows an id. Titles only, no items, since
 * this is a picker list, not a place to render full checklist content.
 *
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ id: string, title: string }[]>}
 */
async function listChecklistDefinitions(deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT id, title FROM checklist_definitions ORDER BY title`;
  return rows.map((row) => ({ id: row.id, title: row.title }));
}

/**
 * @param {string} checklistDefinitionId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/readinessChecklist").ChecklistDefinition | null>}
 */
async function getChecklistDefinition(checklistDefinitionId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM checklist_definitions WHERE id = ${checklistDefinitionId}`;
  if (rows.length === 0) return null;
  return { id: rows[0].id, title: rows[0].title, items: rows[0].items };
}

/**
 * Guarantees a checklist_submissions row exists (default status "draft")
 * before any answer/assessment write needs to check or update it --
 * ON CONFLICT DO NOTHING makes this safe to call unconditionally.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/readinessChecklist").ChecklistSubmission>}
 */
async function ensureSubmission(organizationId, checklistDefinitionId, deps = {}) {
  const sql = deps.sql || getSql();
  await sql`
    INSERT INTO checklist_submissions (organization_id, checklist_definition_id, status)
    VALUES (${organizationId}, ${checklistDefinitionId}, 'draft')
    ON CONFLICT (organization_id, checklist_definition_id) DO NOTHING
  `;
  const rows = await sql`
    SELECT * FROM checklist_submissions WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}
  `;
  return mapRowToSubmission(rows[0]);
}

/**
 * Customer path: answer (and optionally comment on) a "customer"-audience
 * item. Refuses to touch a "staff"-audience item (that's staff's
 * question to answer, not the customer's) and refuses to write while the
 * submission is under review or already verified (canCustomerEdit()).
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {string} actorId
 * @param {{ itemKey: string, met: boolean, comment?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object }} [deps]
 * @returns {Promise<void>}
 */
async function recordCustomerAnswer(organizationId, checklistDefinitionId, actorId, input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);
  assertValidChecklistItemAnswer(input);

  const definition = await getChecklistDefinition(checklistDefinitionId, { sql });
  if (!definition) throw new Error(`recordCustomerAnswer: no checklist definition "${checklistDefinitionId}"`);
  const item = definition.items.find((i) => i.key === input.itemKey);
  if (!item) throw new Error(`recordCustomerAnswer: no item "${input.itemKey}" on this checklist`);
  if (item.audience !== "customer") throw new Error(`recordCustomerAnswer: item "${input.itemKey}" is staff-only, not customer-editable`);

  const submission = await ensureSubmission(organizationId, checklistDefinitionId, { sql });
  if (!canCustomerEdit(submission.status)) {
    throw new Error(`recordCustomerAnswer: checklist is "${submission.status}" -- not editable right now`);
  }

  await sql`
    INSERT INTO checklist_responses (id, organization_id, checklist_definition_id, item_key, met, comment, recorded_at)
    VALUES (${idGenerator()}, ${organizationId}, ${checklistDefinitionId}, ${input.itemKey}, ${input.met}, ${input.comment ?? null}, ${now().toISOString()})
    ON CONFLICT (organization_id, checklist_definition_id, item_key)
    DO UPDATE SET met = EXCLUDED.met, comment = EXCLUDED.comment, recorded_at = EXCLUDED.recorded_at
  `;

  await auditRecorder.record(
    {
      correlationId: checklistDefinitionId,
      actorType: "user",
      actorId,
      organizationId,
      action: "checklist.answer",
      targetType: "checklist_response",
      targetId: `${checklistDefinitionId}:${input.itemKey}`,
      outcome: "success",
      metadata: { itemKey: input.itemKey, met: input.met },
    },
    deps
  );
}

/**
 * Staff path: assess any item (verify a customer's answer, answer a
 * "staff"-audience item, and/or leave an internal note). Never lets a
 * customer's own "customer"-audience answer be overwritten through this
 * path -- `met` is only applied when the item itself is staff-audience;
 * verifying a customer item only ever sets staffVerified/staffNote.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {string} actorId
 * @param {{ itemKey: string, met?: boolean, staffNote?: string, staffVerified: boolean }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object }} [deps]
 * @returns {Promise<void>}
 */
async function recordStaffAssessment(organizationId, checklistDefinitionId, actorId, input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const definition = await getChecklistDefinition(checklistDefinitionId, { sql });
  if (!definition) throw new Error(`recordStaffAssessment: no checklist definition "${checklistDefinitionId}"`);
  const item = definition.items.find((i) => i.key === input.itemKey);
  if (!item) throw new Error(`recordStaffAssessment: no item "${input.itemKey}" on this checklist`);

  const existingRows = await sql`
    SELECT met FROM checklist_responses WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId} AND item_key = ${input.itemKey}
  `;
  const existingMet = existingRows.length > 0 ? existingRows[0].met : false;
  const metToStore = item.audience === "staff" ? Boolean(input.met) : existingMet;

  assertValidChecklistItemAnswer({ itemKey: input.itemKey, met: metToStore, staffNote: input.staffNote, staffVerified: input.staffVerified });

  await sql`
    INSERT INTO checklist_responses (id, organization_id, checklist_definition_id, item_key, met, staff_note, staff_verified, recorded_at)
    VALUES (${idGenerator()}, ${organizationId}, ${checklistDefinitionId}, ${input.itemKey}, ${metToStore}, ${input.staffNote ?? null}, ${input.staffVerified}, ${now().toISOString()})
    ON CONFLICT (organization_id, checklist_definition_id, item_key)
    DO UPDATE SET met = EXCLUDED.met, staff_note = EXCLUDED.staff_note, staff_verified = EXCLUDED.staff_verified, recorded_at = EXCLUDED.recorded_at
  `;

  await auditRecorder.record(
    {
      correlationId: checklistDefinitionId,
      actorType: "user",
      actorId,
      organizationId,
      action: "checklist.staff_assess",
      targetType: "checklist_response",
      targetId: `${checklistDefinitionId}:${input.itemKey}`,
      outcome: "success",
      metadata: { itemKey: input.itemKey, staffVerified: input.staffVerified },
    },
    deps
  );
}

/**
 * "Submitted for review" (Session 20 directive, verbatim customer-facing
 * label). Legal only from draft or returned (checklistSubmissionWorkflow.js).
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {string} actorId
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/readinessChecklist").ChecklistSubmission>}
 */
async function submitChecklistForReview(organizationId, checklistDefinitionId, actorId, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  const current = await ensureSubmission(organizationId, checklistDefinitionId, { sql });
  const decision = transitionChecklistSubmission(current.status, "submitted");
  if (!decision.allowed) throw new Error(`submitChecklistForReview: ${decision.reason}`);

  const nowIso = now().toISOString();
  await sql`
    UPDATE checklist_submissions
    SET status = 'submitted', submitted_at = ${nowIso}, submitted_by = ${actorId}
    WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}
  `;

  await auditRecorder.record(
    {
      correlationId: checklistDefinitionId,
      actorType: "user",
      actorId,
      organizationId,
      action: "checklist.submit",
      targetType: "checklist_submission",
      targetId: checklistDefinitionId,
      outcome: "success",
      metadata: { fromStatus: current.status },
    },
    deps
  );

  return { ...current, status: "submitted", submittedAt: nowIso, submittedBy: actorId };
}

/**
 * Staff path: return for changes (requires a reviewNote so the customer
 * knows what to fix) or mark verified.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {string} actorId
 * @param {{ action: "return" | "verify", reviewNote?: string }} input
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/readinessChecklist").ChecklistSubmission>}
 */
async function reviewChecklistSubmission(organizationId, checklistDefinitionId, actorId, input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  if (input.action !== "return" && input.action !== "verify") {
    throw new Error('reviewChecklistSubmission: action must be "return" or "verify"');
  }
  if (input.action === "return" && (!input.reviewNote || !input.reviewNote.trim())) {
    throw new Error("reviewChecklistSubmission: reviewNote is required when returning a checklist for changes");
  }

  const current = await ensureSubmission(organizationId, checklistDefinitionId, { sql });
  const nextStatus = input.action === "return" ? "returned" : "verified";
  const decision = transitionChecklistSubmission(current.status, nextStatus);
  if (!decision.allowed) throw new Error(`reviewChecklistSubmission: ${decision.reason}`);

  const nowIso = now().toISOString();
  const reviewNote = input.action === "return" ? input.reviewNote : null;
  await sql`
    UPDATE checklist_submissions
    SET status = ${nextStatus}, reviewed_at = ${nowIso}, reviewed_by = ${actorId}, review_note = ${reviewNote}
    WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}
  `;

  await auditRecorder.record(
    {
      correlationId: checklistDefinitionId,
      actorType: "user",
      actorId,
      organizationId,
      action: input.action === "return" ? "checklist.return" : "checklist.verify",
      targetType: "checklist_submission",
      targetId: checklistDefinitionId,
      outcome: "success",
      metadata: { fromStatus: current.status },
    },
    deps
  );

  // Built from scratch, not spread from `current` -- `current` can carry
  // a stale reviewNote from a PRIOR return that this call just cleared
  // in the database (review_note is always overwritten above, including
  // to null on verify). Spreading `current` would leak that stale value
  // back to the caller even though the real row no longer has it.
  return {
    organizationId,
    checklistDefinitionId,
    status: nextStatus,
    ...(current.submittedAt ? { submittedAt: current.submittedAt } : {}),
    ...(current.submittedBy ? { submittedBy: current.submittedBy } : {}),
    reviewedAt: nowIso,
    reviewedBy: actorId,
    ...(reviewNote ? { reviewNote } : {}),
  };
}

/**
 * Customer-facing read: "customer"-audience items only, each item's
 * `met`/`comment` only -- never staffNote, never staffVerified. Includes
 * the review note ONLY when the submission was returned (that note is
 * addressed to the customer -- "here's what to fix"), never otherwise.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ definition: { id: string, title: string, items: import("../domain/readinessChecklist").ChecklistItem[] }, answers: { itemKey: string, met: boolean, comment: string | null }[], submission: { status: string, submittedAt: string | null, reviewedAt: string | null, reviewNote: string | null } }>}
 */
async function getChecklistForCustomer(organizationId, checklistDefinitionId, deps = {}) {
  const sql = deps.sql || getSql();
  const definition = await getChecklistDefinition(checklistDefinitionId, { sql });
  if (!definition) throw new Error(`getChecklistForCustomer: no checklist definition "${checklistDefinitionId}"`);

  const customerItems = definition.items.filter((i) => i.audience === "customer");
  const rows = await sql`
    SELECT item_key, met, comment FROM checklist_responses
    WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}
  `;
  const byKey = new Map(rows.map((r) => [r.item_key, r]));
  const answers = customerItems.map((item) => {
    const row = byKey.get(item.key);
    return { itemKey: item.key, met: row ? row.met : false, comment: row ? row.comment : null };
  });

  const submission = await ensureSubmission(organizationId, checklistDefinitionId, { sql });

  return {
    definition: { id: definition.id, title: definition.title, items: customerItems },
    answers,
    submission: {
      status: submission.status,
      submittedAt: submission.submittedAt ?? null,
      reviewedAt: submission.reviewedAt ?? null,
      reviewNote: submission.status === "returned" ? submission.reviewNote ?? null : null,
    },
  };
}

/**
 * Staff-facing read: every item (both audiences), every field including
 * staffNote/staffVerified, plus the computed score.
 *
 * @param {string} organizationId
 * @param {string} checklistDefinitionId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ definition: import("../domain/readinessChecklist").ChecklistDefinition, answers: import("../domain/readinessChecklist").ChecklistItemAnswer[], submission: import("../domain/readinessChecklist").ChecklistSubmission, score: import("../policy/readinessChecklist").ReadinessScore }>}
 */
async function getChecklistForStaff(organizationId, checklistDefinitionId, deps = {}) {
  const sql = deps.sql || getSql();
  const definition = await getChecklistDefinition(checklistDefinitionId, { sql });
  if (!definition) throw new Error(`getChecklistForStaff: no checklist definition "${checklistDefinitionId}"`);

  const rows = await sql`
    SELECT item_key, met, comment, staff_note, staff_verified FROM checklist_responses
    WHERE organization_id = ${organizationId} AND checklist_definition_id = ${checklistDefinitionId}
  `;
  const byKey = new Map(rows.map((r) => [r.item_key, r]));
  const answers = definition.items.map((item) => {
    const row = byKey.get(item.key);
    return {
      itemKey: item.key,
      met: row ? row.met : false,
      comment: row && row.comment ? row.comment : undefined,
      staffNote: row && row.staff_note ? row.staff_note : undefined,
      staffVerified: row ? row.staff_verified : false,
    };
  });

  const submission = await ensureSubmission(organizationId, checklistDefinitionId, { sql });
  const score = scoreChecklist(
    definition,
    answers.map((a) => ({ itemKey: a.itemKey, met: a.met }))
  );

  return { definition, answers, submission, score };
}

function mapRowToSubmission(row) {
  return {
    organizationId: row.organization_id,
    checklistDefinitionId: row.checklist_definition_id,
    status: row.status,
    ...(row.submitted_at ? { submittedAt: new Date(row.submitted_at).toISOString() } : {}),
    ...(row.submitted_by ? { submittedBy: row.submitted_by } : {}),
    ...(row.reviewed_at ? { reviewedAt: new Date(row.reviewed_at).toISOString() } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.review_note ? { reviewNote: row.review_note } : {}),
  };
}

module.exports = {
  createChecklistDefinition,
  listChecklistDefinitions,
  getChecklistDefinition,
  recordCustomerAnswer,
  recordStaffAssessment,
  submitChecklistForReview,
  reviewChecklistSubmission,
  getChecklistForCustomer,
  getChecklistForStaff,
  mapRowToSubmission,
};
