// designer-quote.js -- turns a Website Designer configuration into something
// buyable.
//
// The configurator produces a price from a catalog of packages, bundles and
// options. That price can't come from the browser: the cart would then be
// telling us what to charge, which is the one thing a cart must never do.
// So the selections are posted here, priced again server-side by the SAME
// recomputeEstimate() the lead flow already used, and stored. What ends up in
// the customer's cart is an opaque quote id -- editing it changes nothing
// they can profit from, because the amount lives here.
//
// Quotes are deliberately claimable-later: someone configures a site, adds it
// to the cart, and only then discovers they need an account. Forcing the
// account first would lose them at exactly the wrong moment, so a quote is
// created anonymously and attached to whoever eventually pays for it.
//
// POST /designer-quote { package, optionalSelected, bundledCategories, customRequest }
//   -> { quoteId, totalCents, summary }
// GET  /designer-quote?id=...  -> the stored quote, for rendering the cart

const crypto = require("node:crypto");
const { json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { recomputeEstimate } = require("./website-designer");

const QUOTE_TTL_DAYS = 30;

function quoteId() {
  return `q${crypto.randomBytes(10).toString("hex")}`;
}

/** The cart key for a configured build. Namespaced so it can never collide
 *  with a catalog product key. */
function cartKeyFor(id) {
  return `quote:${id}`;
}

function parseCartKey(key) {
  const m = /^quote:(q[a-f0-9]{20})$/.exec(String(key || ""));
  return m ? m[1] : null;
}

function clean(s, max) {
  return String(s == null ? "" : s).trim().slice(0, max);
}

exports.handler = async (event, context, deps = {}) => {
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;

  /* --------------------------------------------------------------- read -- */
  if (event.httpMethod === "GET") {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || "";
    if (!/^q[a-f0-9]{20}$/.test(id)) return json(400, { error: "Unknown quote." });
    const quote = await getJSONFn("quotes", id);
    if (!quote) return json(404, { error: "That quote has expired. Build it again and we'll price it fresh." });
    return json(200, { quote: publicQuote(quote) });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) || "unknown";
  if (await rateLimited("designer-quote", ip, 30, 3600)) {
    return json(429, { error: "Too many quotes from this connection. Give us a call on 804-309-0968." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

  const pkg = body.package === "business" ? "business" : "starter";
  const optionalSelected = Array.isArray(body.optionalSelected) ? body.optionalSelected.slice(0, 200) : [];
  const bundledCategories = Array.isArray(body.bundledCategories) ? body.bundledCategories.slice(0, 50) : [];

  // Priced WITHOUT the Heroes Discount. Eligibility lives on the account and
  // is verified before payment -- a self-attested checkbox in a configurator
  // is just a price the customer picked, which is exactly what the account
  // flow exists to prevent.
  const estimate = (deps.recomputeEstimate || recomputeEstimate)(pkg, optionalSelected, bundledCategories, false);
  const totalCents = Math.round(Number(estimate.total) * 100);
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return json(400, { error: "That configuration didn't price correctly. Refresh and try again." });
  }

  const now = (deps.now ? deps.now() : new Date());
  const id = (deps.idGenerator || quoteId)();
  const record = {
    id,
    package: pkg,
    packageName: pkg === "business" ? "Business website" : "Starter website",
    optionalSelected: optionalSelected.map((f) => ({
      title: clean(f && f.title, 120),
      category: clean(f && f.category, 80),
      price: Number(f && f.price) || 0,
    })),
    bundledCategories: bundledCategories.map((c) => clean(c, 80)),
    customRequest: clean(body.customRequest, 2000),
    subtotalCents: Math.round(Number(estimate.subtotal) * 100),
    bundleSavingsCents: Math.round(Number(estimate.bundleSavings) * 100),
    totalCents,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_DAYS * 86400000).toISOString(),
  };
  await setJSONFn("quotes", id, record);

  return json(201, {
    quoteId: id,
    cartKey: cartKeyFor(id),
    totalCents,
    summary: publicQuote(record),
  });
};

/** What the cart and the order are allowed to see. */
function publicQuote(q) {
  return {
    id: q.id,
    package: q.package,
    packageName: q.packageName,
    name: `${q.packageName} — custom build`,
    featureCount: (q.optionalSelected || []).length,
    features: (q.optionalSelected || []).map((f) => f.title),
    bundledCategories: q.bundledCategories || [],
    customRequest: q.customRequest || "",
    subtotalCents: q.subtotalCents,
    bundleSavingsCents: q.bundleSavingsCents,
    totalCents: q.totalCents,
    createdAt: q.createdAt,
    expiresAt: q.expiresAt,
  };
}

module.exports.parseCartKey = parseCartKey;
module.exports.cartKeyFor = cartKeyFor;
module.exports.publicQuote = publicQuote;
module.exports.QUOTE_TTL_DAYS = QUOTE_TTL_DAYS;
