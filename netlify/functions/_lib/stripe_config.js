// stripe_config.js -- which Stripe credentials are in play, resolved once.
//
// Two full sets of credentials can live in Netlify at the same time, and
// STRIPE_MODE decides which pair is active:
//
//   STRIPE_MODE=test   ->  STRIPE_TEST_KEY      + STRIPE_TEST_WEBHOOK_SECRET
//   STRIPE_MODE=live   ->  STRIPE_SECRET_KEY    + STRIPE_WEBHOOK_SECRET
//   (unset)            ->  live, because a silent default to test mode would
//                          mean real customers checking out against fake
//                          money and no payment ever arriving.
//
// Why a resolver instead of reading process.env at each call site: the key
// and the webhook secret MUST come from the same mode. A live key paired
// with a test signing secret produces a 401 on every delivery, and the only
// symptom anyone sees is an order stuck forever on "Waiting on payment" --
// no error page, no failed charge, nothing. Resolving both together makes
// that pairing impossible to get wrong by editing one variable.
//
// The other half of the guard is the prefix check. If STRIPE_MODE says test
// but the key actually starts sk_live_, we refuse rather than proceed: that
// is the one mistake that charges real cards while the owner believes they
// are testing, and it must never be recoverable-by-accident.

const MODES = ["test", "live"];

const SLOTS = {
  test: { key: "STRIPE_TEST_KEY", secret: "STRIPE_TEST_WEBHOOK_SECRET", prefixes: ["sk_test_", "rk_test_"] },
  live: { key: "STRIPE_SECRET_KEY", secret: "STRIPE_WEBHOOK_SECRET", prefixes: ["sk_live_", "rk_live_"] },
};

/** What the key's own prefix says it is, regardless of which slot it sat in. */
function modeOfKey(key) {
  if (!key) return "missing";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unknown";
}

/**
 * @param {object} [env] defaults to process.env
 * @returns {{mode, keyVar, secretVar, secretKey, webhookSecret, actualKeyMode,
 *            ok, problems: string[], available: object}}
 */
function resolveStripe(env) {
  const e = env || process.env;
  const declared = String(e.STRIPE_MODE || "").trim().toLowerCase();
  const mode = MODES.includes(declared) ? declared : "live";
  const slot = SLOTS[mode];

  const secretKey = e[slot.key] || "";
  const webhookSecret = e[slot.secret] || "";
  const actualKeyMode = modeOfKey(secretKey);
  const problems = [];
  // The single reason the config can't be used, if there is one. Severity
  // matters: "your key is the wrong mode" must never be buried under a
  // lower-stakes warning that happened to be appended after it.
  let blocker = null;

  if (!declared) {
    // Not a problem, but worth surfacing: it's the difference between
    // "deliberately live" and "nobody has said".
    problems.push(`STRIPE_MODE isn't set, so live mode is assumed. Set it to "test" to use ${SLOTS.test.key}.`);
  } else if (!MODES.includes(declared)) {
    problems.push(`STRIPE_MODE is "${declared}", which isn't "test" or "live". Falling back to live.`);
  }

  if (!secretKey) {
    blocker = `${slot.key} isn't set, so ${mode} mode has no key. Add it in Netlify and redeploy.`;
    problems.push(blocker);
  } else if (actualKeyMode === "unknown") {
    blocker = `${slot.key} doesn't look like a Stripe secret key (expected ${slot.prefixes[0]}…).`;
    problems.push(blocker);
  } else if (actualKeyMode !== mode) {
    // The dangerous one, in both directions.
    blocker =
      `${slot.key} holds a ${actualKeyMode.toUpperCase()} key but STRIPE_MODE is "${mode}". ` +
      (actualKeyMode === "live"
        ? "Refusing to use it: you would be charging real cards while believing you were testing."
        : "Refusing to use it: real customers would check out against test money and no payment would arrive.");
    problems.push(blocker);
  }

  if (!webhookSecret) {
    problems.push(`${slot.secret} isn't set, so ${mode}-mode webhooks will be rejected.`);
  }

  // Usable only when the key exists AND its prefix agrees with the mode. A
  // missing webhook secret doesn't block checkout -- it blocks confirmation,
  // which the webhook handler reports on its own.
  const ok = !!secretKey && actualKeyMode === mode;

  return {
    mode,
    declaredMode: declared || null,
    keyVar: slot.key,
    secretVar: slot.secret,
    secretKey: ok ? secretKey : "",
    webhookSecret,
    actualKeyMode,
    ok,
    blocker,
    problems,
    // Which slots are populated at all, for the setup screen. Booleans only:
    // no key material, ever.
    available: {
      [SLOTS.test.key]: !!e[SLOTS.test.key],
      [SLOTS.test.secret]: !!e[SLOTS.test.secret],
      [SLOTS.live.key]: !!e[SLOTS.live.key],
      [SLOTS.live.secret]: !!e[SLOTS.live.secret],
    },
  };
}

/** The key, or a thrown error naming exactly what to fix. */
function requireSecretKey(env) {
  const c = resolveStripe(env);
  if (!c.ok) throw new Error(c.blocker || `${c.keyVar} is not configured.`);
  return c.secretKey;
}

module.exports = { resolveStripe, requireSecretKey, modeOfKey, MODES, SLOTS };
