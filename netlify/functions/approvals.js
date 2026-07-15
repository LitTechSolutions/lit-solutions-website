// approvals.js -- HTTP endpoint for F016 (Customer Approval Inbox). Thin
// adapter over src/db/approvalStore.js; every transition decision still
// happens in src/policy/approvalWorkflow.js's transitionApproval().
// Approval requests themselves are created as a side effect of other
// flows (e.g. changeOrderStore.createChangeOrder()), not directly by a
// customer over HTTP -- this endpoint is deliberately view + decide
// only, matching F016's "inbox" framing.
//
// Routes:
//   GET   /approvals?organizationId=... -- list pending approvals for an org
//                                            (org_owner or platform_admin, approval.view)
//   PATCH /approvals -- approve or reject a specific approval request
//                        (org_owner, scope.approve or change_order.approve
//                        depending on the approval's subjectType; platform_admin bypasses)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { listPendingApprovals, applyApprovalDecision } = require("../../src/db/approvalStore");

const APPROVE_ACTION_BY_SUBJECT_TYPE = {
  scope: "scope.approve",
  change_order: "change_order.approve",
};

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleDecision(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "approval.view");
  if (deny) return deny;

  const approvals = await listPendingApprovals(organizationId, deps);
  return json(200, { approvals });
}

async function handleDecision(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { approvalId, organizationId, subjectType, decisionAction, decisionNote } = body;
  if (!approvalId || !organizationId || !decisionAction) {
    return json(400, { error: "approvalId, organizationId, and decisionAction are required." });
  }

  const approveAction = APPROVE_ACTION_BY_SUBJECT_TYPE[subjectType];
  if (!approveAction) {
    return json(400, { error: `subjectType must be one of ${Object.keys(APPROVE_ACTION_BY_SUBJECT_TYPE).join(", ")}` });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, approveAction);
  if (deny) return deny;

  try {
    const approval = await applyApprovalDecision(approvalId, decisionAction, { decidedBy: auth.session.userId, decisionNote }, deps);
    return json(200, { approval });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
