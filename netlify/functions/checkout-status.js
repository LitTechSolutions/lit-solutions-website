// checkout-status.js -- public, unauthenticated read of the payment switch.
//
// The cart needs to know whether payments are open BEFORE someone signs in,
// so it can say so up front rather than letting them fill a basket, press
// pay, and hit a wall. It exposes one boolean and a customer-safe sentence,
// never the reason or the variable name -- that's for the admin screen.

const { json } = require("./_lib/auth_utils");
const { checkoutEnabled, DISABLED_MESSAGE } = require("./_lib/checkout_status");

exports.handler = async (event, context, deps = {}) => {
  const enabled = (deps.checkoutEnabled || checkoutEnabled)(deps.env);
  return json(200, {
    enabled,
    message: enabled ? null : DISABLED_MESSAGE,
  });
};
