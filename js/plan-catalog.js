/* Website plan catalog -- the front end's single source of truth.
 *
 * The cart, the plan pages, the checkout summary and the dashboard all need
 * to agree on what a plan is called and what it costs. Before this, those
 * numbers were hand-typed into pricing.html, payment.html, website-designer.html
 * and three generated plan pages, and the tier rename showed exactly how that
 * goes wrong -- a display name in one file, a Square link in another, and
 * nothing connecting them.
 *
 * Server-side note: this is display data only. Nothing here is trusted for
 * money. The order a customer creates records a plan KEY; the amount actually
 * charged is whatever the Square payment link is configured for, and Square is
 * the source of truth for whether it was paid. A tampered localStorage cart
 * can therefore change what a customer *sees*, but not what they *pay*.
 */
(function (global) {
  'use strict';

  var PLANS = [
    {
      key: 'standard',
      name: 'Standard',
      page: 'plan-standard.html',
      depositCents: 14900,
      monthlyCents: 7900,
      deposit: '$149',
      monthly: '$79',
      minimumTermMonths: 12,
      tagline: 'A clean, professional site that gets you found and gets you called.',
      summary: 'Up to 5 pages, custom designed, mobile-responsive, contact form, basic SEO.',
      depositLink: 'https://square.link/u/lwgSQrWM',
      subscriptionLink: 'https://square.link/u/fLTqZg7k',
    },
    {
      key: 'premium',
      name: 'Premium',
      page: 'plan-premium.html',
      featured: true,
      depositCents: 24900,
      monthlyCents: 12900,
      deposit: '$249',
      monthly: '$129',
      minimumTermMonths: 12,
      tagline: 'A site that actually runs leads, bookings and content through it.',
      summary: 'Up to 10 pages, service pages, blog, FAQ, testimonials, booking, enhanced SEO.',
      depositLink: 'https://square.link/u/GaFznrtG',
      subscriptionLink: 'https://square.link/u/Y40Brp2x',
    },
    {
      key: 'executive',
      name: 'Executive',
      page: 'plan-executive.html',
      depositCents: 39900,
      monthlyCents: 19900,
      deposit: '$399',
      monthly: '$199',
      minimumTermMonths: 12,
      tagline: 'Accounts, logins, and content you manage yourself.',
      summary: 'Everything in Premium, plus customer sign-in, 2FA, dashboards and admin editing.',
      depositLink: 'https://square.link/u/av8VJj8O',
      subscriptionLink: 'https://square.link/u/izfCOOLP',
    },
  ];

  function getPlan(key) {
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].key === key) return PLANS[i];
    return null;
  }

  function formatCents(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  global.LTS_PLANS = { PLANS: PLANS, getPlan: getPlan, formatCents: formatCents };
})(window);
