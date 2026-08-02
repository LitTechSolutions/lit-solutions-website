// checkout_status.js -- the switch that stops anyone paying.
//
// Turned off deliberately on 2026-08-01 while the site was running against
// Stripe TEST keys. That combination is the dangerous one: a real customer
// could complete a checkout, see a success page, receive a confirmation, and
// have no money move at all. They'd believe they had bought a website. A
// hard failure is far kinder than a convincing fake sale.
//
// It is OPT-IN, not opt-out. Checkout is off unless CHECKOUT_ENABLED is
// exactly "true" in the environment, so the safe state is the one you get by
// doing nothing -- including on a fresh deploy, a rollback, or a restored
// backup. The mistake this guards against costs a customer's trust, so it
// should take a deliberate act to undo, not an omission.
//
// TO TURN PAYMENTS BACK ON:
//   1. Confirm STRIPE_MODE is "live" and STRIPE_SECRET_KEY holds an sk_live_
//      key (My Account -> Stripe setup shows both at a glance).
//   2. Add CHECKOUT_ENABLED = true in Netlify -> Site configuration ->
//      Environment variables.
//   3. Trigger a redeploy; Netlify only picks up new variables on a build.
//   4. Run `npm run stripe:check` and take one real payment yourself.

const DISABLED_MESSAGE =
  "Online checkout is paused for maintenance and nothing has been charged. " +
  "Call us on 804-309-0968 or email dylan@lit-solutions.tech and we'll take " +
  "your order directly — you won't lose anything you've put in your cart.";

function checkoutMode(env) {
  const e = env || process.env;
  const configured = String(e.CHECKOUT_ENABLED || "").trim().toLowerCase();
  if (configured === "true" || configured === "public") return "public";
  if (configured === "admin" || configured === "admin-only" || configured === "admin_only") return "admin";
  return "off";
}

function checkoutEnabled(env) {
  return checkoutMode(env) === "public";
}

function checkoutAllowed(role, env) {
  const mode = checkoutMode(env);
  return mode === "public" || (mode === "admin" && role === "admin");
}

/** Why it's off, for the admin screen. Never shown to a customer. */
function checkoutStatus(env) {
  const e = env || process.env;
  const mode = checkoutMode(e);
  const enabled = mode === "public";
  return {
    enabled,
    mode,
    reason: mode === "public"
      ? null
      : mode === "admin"
        ? "Checkout is in admin-only canary mode. Customers remain blocked server-side."
        : "CHECKOUT_ENABLED is not set to \"true\". Payments are blocked server-side.",
    howToEnable:
      "Set CHECKOUT_ENABLED=admin for a private live canary first. After it succeeds, set " +
      "CHECKOUT_ENABLED=true and redeploy — but confirm STRIPE_MODE is \"live\" first, or customers " +
      "will pay into test mode and no money will move.",
  };
}

module.exports = { checkoutMode, checkoutEnabled, checkoutAllowed, checkoutStatus, DISABLED_MESSAGE };
