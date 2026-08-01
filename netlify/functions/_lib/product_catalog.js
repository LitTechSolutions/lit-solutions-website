// product_catalog.js -- every purchasable thing on the site, server-side.
// This is the copy that decides money. js/product-catalog.js is generated
// FROM this file by scripts/build-product-catalog.js, so the two can't drift.
//
// What is and isn't in the cart, and why
// -------------------------------------
// Owner's rule, 2026-08-01: **website services are fixed-rate and can be paid
// for on the site; IT services are quoted and invoiced.**
//
// So the cart holds website work only -- the three subscription plans, the
// two buy-outright builds, the Website Care Plan, and the four flat-rate
// website services (domain, business email, SEO, domain management).
//
// Everything IT-side -- computer repair, networking, cybersecurity,
// workstations, printers -- is deliberately NOT checkout-able, and lives in
// INVOICE_ONLY below.
//
// The one deliberate exception is `it-support`, confirmed by the owner
// 2026-08-01: it is IT by name, but it is an ongoing flat monthly PLAN with a
// card on file, not a job that has to be scoped -- the same shape as the
// Website Care Plan, and how it was already sold through Square. The rule is
// really "IT *jobs* are quoted and invoiced"; ongoing plans are a flat price
// by definition, so there is nothing to quote. Those jobs vary with the site, the hardware and what we
// find when we look, so a price taken in a cart would be a number we'd have
// to renegotiate afterwards. They keep their published "starting at" figures
// as a guide, we quote the real number before starting, and the customer
// pays that invoice through the Pay a Bill page.
//
// QUOTE_ONLY is a third category: work whose published price is hourly or
// parts-dominated, where even a "starting at" is only a floor.
//
// Pricing model
// -------------
// Amounts are in cents and passed to Stripe as inline `price_data`, so there
// is nothing to create or maintain in the Stripe dashboard and no product-ID
// drift of the kind that already bit us with Square's product names.

const CURRENCY = "usd";

/**
 * kind:
 *   "plan"         website subscription -- one-time deposit + recurring monthly
 *   "package"      buy-outright website build, charged 50% now / 50% at launch
 *   "subscription" ongoing monthly service, no deposit
 *   "service"      fixed-price one-off
 */
const PRODUCTS = [
  /* ---------------------------------------------- website subscriptions -- */
  {
    key: "plan-standard", kind: "plan", category: "Website subscription",
    name: "Standard", page: "plan-standard.html",
    depositCents: 14900, monthlyCents: 7900, minimumTermMonths: 12,
    summary: "Up to 5 pages, custom designed, mobile-responsive, contact form, basic SEO.",
    blurb: "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
  },
  {
    key: "plan-premium", kind: "plan", category: "Website subscription", featured: true,
    name: "Premium", page: "plan-premium.html",
    depositCents: 24900, monthlyCents: 12900, minimumTermMonths: 12,
    summary: "Up to 10 pages, service pages, blog, FAQ, testimonials, booking, enhanced SEO.",
    blurb: "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
  },
  {
    key: "plan-executive", kind: "plan", category: "Website subscription",
    name: "Executive", page: "plan-executive.html",
    depositCents: 39900, monthlyCents: 19900, minimumTermMonths: 12,
    summary: "Everything in Premium, plus customer sign-in, 2FA, dashboards and admin editing.",
    blurb: "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
  },

  /* -------------------------------------------------- buy-outright builds -- */
  {
    key: "package-starter", kind: "package", category: "Website build",
    name: "Starter website", page: "pricing.html",
    totalCents: 69900,
    summary: "Up to 5 pages, custom design, mobile-responsive, contact form, basic SEO. Yours outright.",
    blurb: "Split 50/50 — half now, half at launch once you've approved it. You own the files and source code.",
  },
  {
    key: "package-business", kind: "package", category: "Website build",
    name: "Business website", page: "pricing.html",
    totalCents: 129900,
    summary: "Up to 10 pages, individual service pages, booking, testimonials, FAQ and blog. Yours outright.",
    blurb: "Split 50/50 — half now, half at launch once you've approved it. You own the files and source code.",
  },

  /* ------------------------------------------------- ongoing subscriptions -- */
  {
    key: "care-plan", kind: "subscription", category: "Ongoing support",
    name: "Website Care Plan", monthlyCents: 3900,
    summary: "Hosting coordination, small content edits, platform checks and general maintenance.",
    blurb: "Only for sites we built, or sites we can get full source access to. Cancel anytime.",
  },
  {
    key: "it-support", kind: "subscription", category: "Ongoing support",
    name: "Small Business IT Support", monthlyCents: 7900,
    summary: "A technician on call for day-to-day IT, without a per-visit invoice every time.",
    blurb: "Scope is confirmed with you before your first billing cycle. Cancel anytime.",
  },

  /* --------------------------------------------------- fixed-price services -- */
  { key: "svc-domain-setup", kind: "service", category: "Website services", name: "Domain registration & DNS setup", amountCents: 3900,
    summary: "Our labour. The registrar's own fee is billed to you directly by them." },
  { key: "svc-email-setup", kind: "service", category: "Website services", name: "Business email setup", amountCents: 5900,
    summary: "Google Workspace or Microsoft 365. Our labour; the subscription is billed to you by them." },
  { key: "svc-seo", kind: "service", category: "Website services", name: "Basic SEO optimization", amountCents: 9900,
    summary: "Titles, descriptions, sitemap, structured data and clean page structure." },
  { key: "svc-domain-mgmt", kind: "service", category: "Website services", name: "Domain management", amountCents: 3900,
    summary: "We keep your DNS and renewals straight. Our labour only." },
];


/**
 * IT services. Published on the pricing page with an indicative "starting at"
 * price, quoted properly before we start, and invoiced afterwards -- never
 * charged through the cart. Kept here (rather than deleted) so the site and
 * this file agree on what exists, and so nothing silently drops off the
 * pricing page when someone edits it.
 */
const INVOICE_ONLY = [
  { category: "Cybersecurity", name: "Password manager setup", fromCents: 4500 },
  { category: "Cybersecurity", name: "Multi-factor authentication setup", fromCents: 4500 },
  { category: "Cybersecurity", name: "Security best practices training", fromCents: 5900 },
  { category: "Cybersecurity", name: "Home or small business security review", fromCents: 9900 },
  { category: "Networking", name: "Home Wi-Fi setup & optimization", fromCents: 7900 },
  { category: "Networking", name: "Router & modem configuration", fromCents: 4900 },
  { category: "Networking", name: "Mesh Wi-Fi installation", fromCents: 11900 },
  { category: "Networking", name: "Printer & device networking", fromCents: 4900 },
  { category: "Networking", name: "Small office network setup", fromCents: 14900 },
  { category: "Small business IT", name: "Computer & workstation setup", fromCents: 4900 },
  { category: "Small business IT", name: "Office printer & scanner setup", fromCents: 5900 },
  { category: "Small business IT", name: "Email migration & setup", fromCents: 7900 },
];

// Hourly or parts-dominated work, where even a "starting at" is just a floor.
// Routed to a real quote rather than shown as a price at all.
const QUOTE_ONLY = [
  "Computer repair & troubleshooting (hourly)",
  "Technology consulting (hourly)",
  "Custom PC build (parts dominate the cost)",
  "Virus & malware removal (needs a look first)",
  "Operating system install / upgrade (depends on the machine)",
  "Data backup & recovery (highly variable)",
  "Network troubleshooting (needs diagnosis)",
  "Website redesign (depends entirely on the existing site)",
  "MoCA, ethernet runs and Starlink installation",
];

function getProduct(key) {
  if (typeof key !== "string") return null;
  return PRODUCTS.find((p) => p.key === key) || null;
}

function listProducts() {
  return PRODUCTS.slice();
}

/** Half now, half at launch -- rounded up so the balance is never the larger half. */
function packageDepositCents(product) {
  return Math.ceil(product.totalCents / 2);
}

/** What recurs monthly for one cart line, in cents. */
function monthlyCents(product) {
  return product.kind === "plan" || product.kind === "subscription" ? product.monthlyCents : 0;
}

// NOTE: there is deliberately no dueTodayCents / toStripeLineItems /
// checkoutMode here any more. This file used to carry its own copy of that
// logic, and having two places that decided money is exactly how a pure
// subscription ended up emitting BOTH a "first month" one-off line AND a
// recurring line -- a real $78 charge on a $39 plan. _lib/pricing.js is now
// the single engine: it applies the 50/50 split, the Heroes rates (15%
// one-time / 5% recurring), and it knows Stripe bills recurring lines
// immediately. This file describes products; pricing.js decides money.

module.exports = {
  CURRENCY,
  PRODUCTS,
  QUOTE_ONLY,
  INVOICE_ONLY,
  getProduct,
  listProducts,
  packageDepositCents,
  monthlyCents,
};
