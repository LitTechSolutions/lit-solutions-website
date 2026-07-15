// payment-requests.js -- HTTP endpoint for F028 (Payment Request &
// Payment Status Reconciliation). Thin adapter over
// src/db/paymentRequestStore.js; the schedule itself is computed by the
// existing src/policy/paymentSchedule.js (Session 14) and status
// transitions by src/policy/paymentReconciliation.js -- this file only
// authenticates, authorizes, and translates HTTP.
//
// Payment requests are billing/financial actions, not day-to-day ticket
// work, so creation and status transitions reuse the existing
// platform_admin-only "billing.reconcile" capability rather than
// technician's assigned-ticket model -- there is no equivalent
// "assigned" fact for billing.
//
// Routes:
//   POST  /payment-requests -- compute and persist the payment schedule
//                               for a priced piece of work (platform_admin,
//                               billing.reconcile)
//   GET   /payment-requests?organizationId=&subjectType=&subjectId= --
//                               list payment requests for a subject
//                               (org_owner/org_member/read_only_customer,
//                               payment.view)
//   PATCH /payment-requests -- transition a payment request's status
//                               (platform_admin, billing.reconcile)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createPaymentRequestsForSchedule, applyPaymentStatusTransition, listPaymentRequestsForSubject } = require("../../src/db/paymentRequestStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleTransition(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, subjectType, subjectId, amountRefPrefix, totalAmount, isThirdPartyExpense } = body;
  if (!organizationId || !subjectType || !subjectId || !amountRefPrefix || typeof totalAmount !== "number") {
    return json(400, { error: "organizationId, subjectType, subjectId, amountRefPrefix, and a numeric totalAmount are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const result = await createPaymentRequestsForSchedule({ organizationId, subjectType, subjectId, amountRefPrefix, totalAmount, isThirdPartyExpense }, { ...deps, actorId: auth.session.userId });
    return json(201, result);
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const subjectType = event.queryStringParameters && event.queryStringParameters.subjectType;
  const subjectId = event.queryStringParameters && event.queryStringParameters.subjectId;
  if (!organizationId || !subjectType || !subjectId) {
    return json(400, { error: "organizationId, subjectType, and subjectId are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "payment.view");
  if (deny) return deny;

  const paymentRequests = await listPaymentRequestsForSubject(subjectType, subjectId, deps);
  return json(200, { paymentRequests });
}

async function handleTransition(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { paymentRequestId, nextStatus, providerReference } = body;
  if (!paymentRequestId || !nextStatus) {
    return json(400, { error: "paymentRequestId and nextStatus are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const paymentRequest = await applyPaymentStatusTransition(paymentRequestId, nextStatus, { ...deps, providerReference, actorId: auth.session.userId });
    return json(200, { paymentRequest });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
