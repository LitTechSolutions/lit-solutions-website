// Session 20 step 8/1 -- Dylan asked to wire a Square Payment Link for
// development rather than build a full dynamic Square Sandbox API
// integration this pass. A Payment Link is a single fixed hosted
// checkout page (not access-token-secret; Square's own product is
// designed to be shared/embedded publicly), so it's safe to keep as a
// plain constant here rather than an env var -- there is no secret to
// protect.
//
// Real limitation, not silently glossed over: this is a STATIC link, so
// it cannot carry a computed amount, ticket/scope reference, or
// organization id the way a real Square Sandbox integration (dynamic
// per-payment-request checkout, matching src/db/paymentRequestStore.js's
// schedule/status model) would. Anyone using this link still has to be
// told out-of-band what to pay and for what, and staff still have to
// manually reconcile the payment against the right payment_requests row
// via PATCH /payment-requests once Square confirms it -- there is no
// webhook wiring this Payment Link to payment-requests.js's status
// transitions. Replace this whole file's usage with a real dynamic
// integration once real Square Sandbox/production credentials and a
// checkout-flow decision (Payment Links vs. embedded Web Payments SDK)
// are available -- see docs/development/SECURITY_REVIEW.md and
// DEV_STATE.json for what's still open.
export const SQUARE_DEV_PAYMENT_LINK_URL = "https://square.link/u/2oozkfhz";
