#!/usr/bin/env node
/*
 * Stripe setup checker.
 *
 *   npm run stripe:check                    (checks lit-solutions.tech)
 *   npm run stripe:check -- https://...     (checks a deploy preview)
 *
 * Tells you which setup steps are actually done on the LIVE site, without
 * ever asking for, printing, or transmitting a secret.
 *
 * How it can know anything without a key: it POSTs a deliberately invalid
 * signature to the webhook and reads the status code. The handler's own
 * fail-closed logic distinguishes the two states for us --
 *
 *   404  the function isn't deployed yet
 *   500  deployed, but STRIPE_WEBHOOK_SECRET is not set
 *   401  deployed AND the secret is set (it rejected our bogus signature)
 *
 * A 401 here is the good answer. Nothing secret is sent or revealed either
 * way: the probe body is a fixed dummy payload and the signature is junk.
 */

const DEFAULT_ORIGIN = "https://lit-solutions.tech";
const origin = (process.argv[2] || DEFAULT_ORIGIN).replace(/\/+$/, "");

const PROBE_BODY = JSON.stringify({ id: "evt_preflight", type: "preflight.check", data: { object: {} } });

function line(ok, label, detail) {
  const mark = ok === true ? "✓" : ok === false ? "✗" : "•";
  console.log(`  ${mark} ${label}${detail ? `\n      ${detail}` : ""}`);
}

async function probe(path, init) {
  try {
    const res = await fetch(`${origin}${path}`, init);
    let body = null;
    try { body = await res.json(); } catch { /* not json */ }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, error: String(err.message || err) };
  }
}

(async () => {
  console.log(`\nStripe preflight — ${origin}\n`);

  /* -------------------------------------------------------- reachable? -- */
  const site = await probe("/cart.html", { method: "GET" });
  if (site.status === 0) {
    line(false, "Site is reachable", site.error);
    console.log("\n  Nothing else can be checked until the site responds.\n");
    process.exit(1);
  }
  line(site.status < 400, `Site is reachable (HTTP ${site.status})`);

  /* ------------------------------------------------- functions deployed -- */
  const checkout = await probe("/.netlify/functions/checkout", { method: "GET" });
  if (checkout.status === 404) {
    line(false, "checkout function is deployed",
      "404 — this branch hasn't been deployed yet. Push, let Netlify build, then re-run.");
  } else if (checkout.status === 401) {
    // "Sign in required" is exactly right for an anonymous caller.
    line(true, "checkout function is deployed", "401 Sign in required — correct for a signed-out request.");
  } else {
    line(null, `checkout function responded ${checkout.status}`,
      (checkout.body && checkout.body.error) || "");
  }

  /* --------------------------------------------------- webhook + secret -- */
  const wh = await probe("/.netlify/functions/stripe-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: PROBE_BODY,
  });

  if (wh.status === 404) {
    line(false, "stripe-webhook is deployed", "404 — not deployed yet.");
    line(false, "STRIPE_WEBHOOK_SECRET is set", "Can't tell until it's deployed.");
  } else if (wh.status === 500) {
    line(true, "stripe-webhook is deployed");
    line(false, "STRIPE_WEBHOOK_SECRET is set",
      "500 — the variable is missing in Netlify, or the site hasn't been redeployed since you added it.");
  } else if (wh.status === 401) {
    line(true, "stripe-webhook is deployed");
    line(true, "STRIPE_WEBHOOK_SECRET is set", "401 — it rejected a bogus signature, which is what it should do.");
  } else {
    line(null, `stripe-webhook responded ${wh.status}`,
      "Unexpected. Check Netlify → Functions → stripe-webhook logs.");
  }

  /* ------------------------------------------------------- secret key ---- */
  // Deliberately not probed. Nothing anonymous can reach a code path that
  // uses it, and adding an endpoint that reports on it would be a worse
  // trade than simply running one test-mode payment. Say so plainly rather
  // than leaving a blank line in the report.
  line(null, "STRIPE_SECRET_KEY is set",
    "Not checkable from outside, by design. One test-mode checkout proves it:\n" +
    "      a missing key surfaces as \"Couldn't start checkout\" and the order is\n" +
    "      marked checkout_failed with the reason recorded on it.");

  const ready = wh.status === 401 && checkout.status === 401;
  console.log(
    ready
      ? "\n  Webhook side is configured. Next: one test-mode payment with 4242 4242 4242 4242.\n" +
        "  See docs/development/STRIPE_SETUP.md.\n"
      : "\n  Not ready yet — work down the ✗ lines above, then re-run.\n" +
        "  Full runbook: docs/development/STRIPE_SETUP.md\n"
  );
})();
