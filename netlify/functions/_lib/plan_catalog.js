// Server-side plan catalog. Mirrors js/plan-catalog.js, but this is the copy
// that decides anything that matters.
//
// The browser copy exists so the cart and plan pages can render without a
// round trip. It is display data and is never trusted: an order records a
// plan KEY, and the key is validated here before an order is created. A
// tampered localStorage cart can change what a customer sees; it cannot
// change what they are charged, because the amount lives on the Square
// payment link and Square decides whether it was paid.
//
// Keep the two in step. If a price changes it changes in three places -- here,
// js/plan-catalog.js, and the Square product itself -- and only Square's
// version is ever charged.

const PLANS = {
  standard: {
    key: "standard",
    name: "Standard",
    page: "plan-standard.html",
    deposit: "$149",
    monthly: "$79",
    depositCents: 14900,
    monthlyCents: 7900,
    minimumTermMonths: 12,
    depositLink: "https://square.link/u/lwgSQrWM",
    subscriptionLink: "https://square.link/u/fLTqZg7k",
    summary: "Up to 5 pages, custom designed, mobile-responsive, contact form, basic SEO.",
  },
  premium: {
    key: "premium",
    name: "Premium",
    page: "plan-premium.html",
    deposit: "$249",
    monthly: "$129",
    depositCents: 24900,
    monthlyCents: 12900,
    minimumTermMonths: 12,
    depositLink: "https://square.link/u/GaFznrtG",
    subscriptionLink: "https://square.link/u/Y40Brp2x",
    summary: "Up to 10 pages, service pages, blog, FAQ, testimonials, booking, enhanced SEO.",
  },
  executive: {
    key: "executive",
    name: "Executive",
    page: "plan-executive.html",
    deposit: "$399",
    monthly: "$199",
    depositCents: 39900,
    monthlyCents: 19900,
    minimumTermMonths: 12,
    depositLink: "https://square.link/u/av8VJj8O",
    subscriptionLink: "https://square.link/u/izfCOOLP",
    summary: "Everything in Premium, plus customer sign-in, 2FA, dashboards and admin editing.",
  },
};

function getPlan(key) {
  if (typeof key !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PLANS, key) ? PLANS[key] : null;
}

function listPlans() {
  return Object.keys(PLANS).map((k) => PLANS[k]);
}

module.exports = { PLANS, getPlan, listPlans };
