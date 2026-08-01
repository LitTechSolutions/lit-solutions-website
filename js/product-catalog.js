/* GENERATED FILE -- do not edit.
 * Source: netlify/functions/_lib/product_catalog.js + _lib/pricing.js
 * Rebuild: node scripts/build-product-catalog.js
 *
 * Display data only. These prices render the cards and the cart; the amount
 * actually charged is recomputed server-side at checkout from the same
 * pricing engine that generated this file. Editing this file changes what a
 * customer sees and nothing about what they pay.
 */
(function (global) {
  'use strict';
  var PRODUCTS = [
    {
      "key": "plan-standard",
      "kind": "plan",
      "category": "Website subscription",
      "name": "Standard",
      "page": "plan-standard.html",
      "featured": false,
      "summary": "Up to 5 pages, custom designed, mobile-responsive, contact form, basic SEO.",
      "blurb": "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
      "minimumTermMonths": 12,
      "totalCents": null,
      "chargedTodayCents": 22800,
      "monthlyCents": 7900,
      "balanceAtLaunchCents": 0,
      "label": "Standard website — deposit",
      "heroChargedTodayCents": 20170,
      "heroMonthlyCents": 7505,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "plan-premium",
      "kind": "plan",
      "category": "Website subscription",
      "name": "Premium",
      "page": "plan-premium.html",
      "featured": true,
      "summary": "Up to 10 pages, service pages, blog, FAQ, testimonials, booking, enhanced SEO.",
      "blurb": "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
      "minimumTermMonths": 12,
      "totalCents": null,
      "chargedTodayCents": 37800,
      "monthlyCents": 12900,
      "balanceAtLaunchCents": 0,
      "label": "Premium website — deposit",
      "heroChargedTodayCents": 33420,
      "heroMonthlyCents": 12255,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "plan-executive",
      "kind": "plan",
      "category": "Website subscription",
      "name": "Executive",
      "page": "plan-executive.html",
      "featured": false,
      "summary": "Everything in Premium, plus customer sign-in, 2FA, dashboards and admin editing.",
      "blurb": "Deposit today, then monthly. We host, maintain and support it; we own the build while you subscribe.",
      "minimumTermMonths": 12,
      "totalCents": null,
      "chargedTodayCents": 59800,
      "monthlyCents": 19900,
      "balanceAtLaunchCents": 0,
      "label": "Executive website — deposit",
      "heroChargedTodayCents": 52820,
      "heroMonthlyCents": 18905,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "package-starter",
      "kind": "package",
      "category": "Website build",
      "name": "Starter website",
      "page": "pricing.html",
      "featured": false,
      "summary": "Up to 5 pages, custom design, mobile-responsive, contact form, basic SEO. Yours outright.",
      "blurb": "Split 50/50 — half now, half at launch once you've approved it. You own the files and source code.",
      "minimumTermMonths": null,
      "totalCents": 69900,
      "chargedTodayCents": 34950,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 34950,
      "label": "Starter website — 50% deposit",
      "heroChargedTodayCents": 29708,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 29707,
      "payInFullCents": 69900,
      "heroPayInFullCents": 59415
    },
    {
      "key": "package-business",
      "kind": "package",
      "category": "Website build",
      "name": "Business website",
      "page": "pricing.html",
      "featured": false,
      "summary": "Up to 10 pages, individual service pages, booking, testimonials, FAQ and blog. Yours outright.",
      "blurb": "Split 50/50 — half now, half at launch once you've approved it. You own the files and source code.",
      "minimumTermMonths": null,
      "totalCents": 129900,
      "chargedTodayCents": 64950,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 64950,
      "label": "Business website — 50% deposit",
      "heroChargedTodayCents": 55208,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 55207,
      "payInFullCents": 129900,
      "heroPayInFullCents": 110415
    },
    {
      "key": "care-plan",
      "kind": "subscription",
      "category": "Ongoing support",
      "name": "Website Care Plan",
      "page": null,
      "featured": false,
      "summary": "Hosting coordination, small content edits, platform checks and general maintenance.",
      "blurb": "Only for sites we built, or sites we can get full source access to. Cancel anytime.",
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 3900,
      "monthlyCents": 3900,
      "balanceAtLaunchCents": 0,
      "label": "Website Care Plan",
      "heroChargedTodayCents": 3705,
      "heroMonthlyCents": 3705,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "it-support",
      "kind": "subscription",
      "category": "Ongoing support",
      "name": "Small Business IT Support",
      "page": null,
      "featured": false,
      "summary": "A technician on call for day-to-day IT, without a per-visit invoice every time.",
      "blurb": "Scope is confirmed with you before your first billing cycle. Cancel anytime.",
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 7900,
      "monthlyCents": 7900,
      "balanceAtLaunchCents": 0,
      "label": "Small Business IT Support",
      "heroChargedTodayCents": 7505,
      "heroMonthlyCents": 7505,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "svc-domain-setup",
      "kind": "service",
      "category": "Website services",
      "name": "Domain registration & DNS setup",
      "page": null,
      "featured": false,
      "summary": "Our labour. The registrar's own fee is billed to you directly by them.",
      "blurb": null,
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 3900,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 0,
      "label": "Domain registration & DNS setup",
      "heroChargedTodayCents": 3315,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "svc-email-setup",
      "kind": "service",
      "category": "Website services",
      "name": "Business email setup",
      "page": null,
      "featured": false,
      "summary": "Google Workspace or Microsoft 365. Our labour; the subscription is billed to you by them.",
      "blurb": null,
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 5900,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 0,
      "label": "Business email setup",
      "heroChargedTodayCents": 5015,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "svc-seo",
      "kind": "service",
      "category": "Website services",
      "name": "Basic SEO optimization",
      "page": null,
      "featured": false,
      "summary": "Titles, descriptions, sitemap, structured data and clean page structure.",
      "blurb": null,
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 9900,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 0,
      "label": "Basic SEO optimization",
      "heroChargedTodayCents": 8415,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    },
    {
      "key": "svc-domain-mgmt",
      "kind": "service",
      "category": "Website services",
      "name": "Domain management",
      "page": null,
      "featured": false,
      "summary": "We keep your DNS and renewals straight. Our labour only.",
      "blurb": null,
      "minimumTermMonths": null,
      "totalCents": null,
      "chargedTodayCents": 3900,
      "monthlyCents": 0,
      "balanceAtLaunchCents": 0,
      "label": "Domain management",
      "heroChargedTodayCents": 3315,
      "heroMonthlyCents": 0,
      "heroBalanceAtLaunchCents": 0,
      "payInFullCents": null,
      "heroPayInFullCents": null
    }
  ];

  function get(key) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].key === key) return PRODUCTS[i];
    return null;
  }
  function money(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }
  function categories() {
    var seen = [];
    PRODUCTS.forEach(function (p) { if (seen.indexOf(p.category) === -1) seen.push(p.category); });
    return seen;
  }
  /* The right price for this viewer: hero pricing if their account carries a
   * verified status, list price otherwise. Never trusted for charging. */
  function priceFor(product, hero) {
    return {
      chargedTodayCents: hero ? product.heroChargedTodayCents : product.chargedTodayCents,
      monthlyCents: hero ? product.heroMonthlyCents : product.monthlyCents,
      balanceAtLaunchCents: hero ? product.heroBalanceAtLaunchCents : product.balanceAtLaunchCents,
      payInFullCents: hero ? product.heroPayInFullCents : product.payInFullCents,
    };
  }

  global.LTS_PRODUCTS = {
    PRODUCTS: PRODUCTS, get: get, money: money, categories: categories, priceFor: priceFor,
  };
})(window);
