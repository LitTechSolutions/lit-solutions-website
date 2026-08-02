// checkout-status.js -- customer-safe read of the payment switch.
//
// The cart needs to know whether payments are open BEFORE someone signs in,
// while an authenticated administrator also needs to run a private canary.
// It exposes one boolean and a customer-safe sentence, never the mode, role,
// reason, or variable name -- those details belong on the admin screen.

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { checkoutAllowed, DISABLED_MESSAGE } = require("./_lib/checkout_status");

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  const enabled = (deps.checkoutAllowed || checkoutAllowed)(session && session.role, deps.env);
  return json(200, {
    enabled,
    message: enabled ? null : DISABLED_MESSAGE,
  });
};
