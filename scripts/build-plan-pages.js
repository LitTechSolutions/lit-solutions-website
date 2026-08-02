#!/usr/bin/env node
/*
 * Generates the three Website Subscription detail pages (plan-standard.html,
 * plan-premium.html, plan-executive.html) from one template plus the PLANS
 * data below.
 *
 * These pages are ~95% identical, and this site has no build step or include
 * mechanism -- three hand-maintained copies would have drifted apart the
 * first time a price or a term changed, which is exactly the class of bug the
 * trust audit was about. Editing PLANS and re-running this is the supported
 * way to change them.
 *
 *   node scripts/build-plan-pages.js
 *
 * Head/header/footer chrome is lifted from an existing page at build time so
 * a future nav or footer change only has to happen in the source pages, not
 * here.
 */

const fs = require('fs');
const path = require('path');
const { getProduct } = require('../netlify/functions/_lib/product_catalog.js');

const ROOT = path.join(__dirname, '..');
const CHROME_SOURCE = 'service-website.html';

/* Prices are NOT written in this file. They come from the product catalog --
 * the same module the checkout endpoint prices against -- so a plan page can
 * never quote a figure Stripe won't charge. Copy lives here; money doesn't. */
function money(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2,
  });
}
function withPrices(plan) {
  const p = getProduct('plan-' + plan.slug);
  if (!p) throw new Error(`No catalog product for plan-${plan.slug}`);
  return Object.assign({}, plan, {
    name: p.name,
    deposit: money(p.depositCents),
    monthly: money(p.monthlyCents),
    dueToday: money(p.depositCents + p.monthlyCents),
  });
}

/* ---------------------------------------------------------------- data --- */

const COMMON_INCLUDED = [
  ['Hosting, deployment &amp; SSL', 'Your site lives on fast, modern infrastructure with HTTPS configured properly. Nothing for you to set up or renew.'],
  ['Security updates', 'Dependencies and platform patches are applied as they land, not when something breaks.'],
  ['Automated backups', 'Taken on a rolling schedule so a bad edit or a bad day is recoverable.'],
  ['Uptime monitoring', 'We find out your site is down before you do.'],
  ['Support by phone, text or email', 'Seven days a week, 7:00am&ndash;7:00pm ET. You get a person, not a ticket queue.'],
];

const PLAN_COPY = [
  {
    slug: 'standard',
    name: 'Standard',
    equivalent: 'Starter',
    equivalentPrice: '$699',
    outcome: 'Get your business online',
    tagline: 'A clean, professional site that gets you found and gets you called.',
    who: 'You need to exist online properly &mdash; somewhere to send people, that loads fast, works on a phone, and shows up when someone searches your name. You don\'t need a blog or a booking system, and you\'d rather not pretend otherwise.',
    pages: ['Home', 'About', 'Services', 'Contact', '+ one more of your choosing'],
    detail: [
      ['Up to 5 pages, designed around your business', 'Not a template with your logo dropped in. We build the layout around what you actually do and who you\'re trying to reach.'],
      ['Mobile-responsive on every device', 'Most of your visitors will be on a phone. The phone layout gets designed, not squeezed.'],
      ['Contact form with spam protection', 'Goes straight to your inbox. Filtered so you\'re not wading through junk to find real enquiries.'],
      ['Basic SEO', 'Page titles, descriptions, a sitemap, and clean structure so search engines can read the site properly.'],
      ['Custom favicon &amp; branded 404 page', 'The small things that make a site feel finished rather than assembled.'],
      ['Accessibility &amp; performance basics', 'Readable contrast, keyboard navigation, proper headings, and images that don\'t take five seconds to load.'],
    ],
    edits: 'One small content change per month &mdash; a price, a paragraph, a new photo. Bigger changes are quoted separately.',
    mockups: ['home', 'mobile'],
  },
  {
    slug: 'premium',
    name: 'Premium',
    featured: true,
    equivalent: 'Business',
    equivalentPrice: '$1,299',
    outcome: 'Generate leads and bookings',
    tagline: 'A site that actually runs leads, bookings and content through it.',
    who: 'Your website has a job beyond existing. You want people booking time with you, finding answers before they call, and seeing proof that other people have hired you. You have things to say and somewhere to say them.',
    pages: ['Home', 'About', 'Individual service pages', 'Blog / news', 'FAQ', 'Testimonials', 'Gallery / portfolio', 'Booking', 'Contact', '+ one more'],
    detail: [
      ['Up to 10 pages, including a page per service', 'One page per thing you do, so each can rank on its own and you can send someone straight to the relevant one.'],
      ['Blog / news section', 'Post updates yourself or send them to us. Genuinely useful for search &mdash; a site that never changes stops being interesting to Google.'],
      ['FAQ page', 'Answers the questions that currently eat your phone time, with the structured data that can surface them directly in search results.'],
      ['Testimonials &amp; reviews', 'Real reviews, presented so they can be checked rather than just claimed.'],
      ['Portfolio / gallery', 'Photographs of your work, organised and fast-loading.'],
      ['Online booking request form', 'Visitors pick a day and time that suits them; you confirm. No third-party scheduling account required.'],
      ['Advanced contact / quote-request form', 'Ask the questions you actually need answered before you call someone back.'],
      ['Newsletter signup', 'Wired to the mailing platform of your choice.'],
      ['Enhanced SEO, schema &amp; analytics', 'Structured data, per-page optimisation, and analytics so you can see what people are doing.'],
      ['Site-wide search', 'Once there are enough pages to get lost in, visitors can find things.'],
    ],
    edits: 'Three content changes per month, and we handle the blog posts if you\'d rather write than wrestle with a CMS.',
    mockups: ['home', 'blog', 'mobile'],
  },
  {
    slug: 'executive',
    name: 'Executive',
    equivalent: 'Business plus accounts, admin tooling and hardening',
    equivalentPrice: 'about $2,500',
    outcome: 'Add accounts and advanced tools',
    tagline: 'For sites that need to <em>do</em> things &mdash; accounts, logins, content you manage yourself.',
    who: 'Your customers need to sign in. Maybe they check an order, download something that\'s theirs, or see history you keep for them. And you want to change your own content without emailing anyone.',
    pages: ['Everything in Premium', 'Sign-in &amp; registration', 'Customer dashboard', 'Profile &amp; preferences', 'Admin content editor', 'Media manager'],
    detail: [
      ['Customer sign-in &amp; registration', 'Proper account handling &mdash; passwords hashed and never stored readable, sessions managed correctly, password reset that works.'],
      ['Two-factor authentication', 'Because a customer account that only needs a password is a customer account waiting to be taken.'],
      ['User dashboard &amp; profiles', 'A signed-in home for each customer showing whatever is genuinely theirs.'],
      ['Admin content editing', 'Change your own text and images without touching code or waiting on us.'],
      ['Media library with access control', 'Upload, organise and replace photographs yourself, with rules about who can see what.'],
      ['Advanced security hardening', 'Rate limiting, stricter headers, upload validation, and a review of the whole surface before launch.'],
      ['Conversion tracking &amp; A/B testing', 'Find out which version of a page actually gets you called, rather than guessing.'],
    ],
    edits: 'Unlimited reasonable content changes, and priority response &mdash; Executive sites go to the front of the queue.',
    mockups: ['home', 'dashboard', 'mobile'],
  },
];

/* ------------------------------------------------------------- mockups --- */
/* Deliberately abstract wireframes rather than screenshots. We have one real
   client site and it would be dishonest to dress up invented screenshots as
   delivered work -- the whole point of this rewrite was not doing that. Each
   is captioned as illustrative. */

const MOCKUPS = {
  home: (p) => `
        <figure class="mockup">
          <div class="mockup-frame">
            <div class="mockup-chrome"><span></span><span></span><span></span><div class="mockup-url">yourbusiness.com</div></div>
            <div class="mockup-body">
              <div class="mk-nav"><div class="mk-logo"></div><div class="mk-links"><i></i><i></i><i></i><i></i></div><div class="mk-cta"></div></div>
              <div class="mk-hero"><div class="mk-h1"></div><div class="mk-h1 is-short"></div><div class="mk-p"></div><div class="mk-p is-short"></div><div class="mk-btns"><b></b><b class="is-ghost"></b></div></div>
              <div class="mk-row">${'<div class="mk-card"><div class="mk-ico"></div><div class="mk-p"></div><div class="mk-p is-short"></div></div>'.repeat(3)}</div>
              <div class="mk-foot"></div>
            </div>
          </div>
          <figcaption>Illustrative wireframe of a ${p.name} home page &mdash; layout and structure, not a finished design. Yours is built around your brand and your content.</figcaption>
        </figure>`,
  blog: (p) => `
        <figure class="mockup">
          <div class="mockup-frame">
            <div class="mockup-chrome"><span></span><span></span><span></span><div class="mockup-url">yourbusiness.com/blog</div></div>
            <div class="mockup-body">
              <div class="mk-nav"><div class="mk-logo"></div><div class="mk-links"><i></i><i></i><i></i><i></i></div><div class="mk-cta"></div></div>
              <div class="mk-pagehead"><div class="mk-h1 is-short"></div><div class="mk-p"></div></div>
              <div class="mk-row">${'<div class="mk-card"><div class="mk-img"></div><div class="mk-p is-tiny"></div><div class="mk-p"></div><div class="mk-p is-short"></div></div>'.repeat(3)}</div>
              <div class="mk-band"><div class="mk-p is-short"></div><div class="mk-inline"><div class="mk-field"></div><b></b></div></div>
              <div class="mk-foot"></div>
            </div>
          </div>
          <figcaption>Illustrative wireframe of the blog and newsletter signup included with ${p.name}.</figcaption>
        </figure>`,
  dashboard: (p) => `
        <figure class="mockup">
          <div class="mockup-frame">
            <div class="mockup-chrome"><span></span><span></span><span></span><div class="mockup-url">yourbusiness.com/account</div></div>
            <div class="mockup-body">
              <div class="mk-nav"><div class="mk-logo"></div><div class="mk-links"><i></i><i></i></div><div class="mk-avatar"></div></div>
              <div class="mk-app">
                <div class="mk-side"><i></i><i class="is-on"></i><i></i><i></i><i></i></div>
                <div class="mk-main">
                  <div class="mk-h1 is-short"></div>
                  <div class="mk-stats"><s></s><s></s><s></s></div>
                  <div class="mk-table"><u></u><u></u><u></u><u></u></div>
                </div>
              </div>
              <div class="mk-foot"></div>
            </div>
          </div>
          <figcaption>Illustrative wireframe of a signed-in customer dashboard &mdash; ${p.name} only.</figcaption>
        </figure>`,
  mobile: (p) => `
        <figure class="mockup mockup--phone">
          <div class="mockup-frame mockup-frame--phone">
            <div class="mockup-notch"></div>
            <div class="mockup-body">
              <div class="mk-nav is-mobile"><div class="mk-logo"></div><div class="mk-burger"><i></i><i></i><i></i></div></div>
              <div class="mk-hero"><div class="mk-h1"></div><div class="mk-h1 is-short"></div><div class="mk-p"></div><div class="mk-p is-short"></div><div class="mk-btns"><b></b></div></div>
              <div class="mk-col">${'<div class="mk-card"><div class="mk-ico"></div><div class="mk-p"></div></div>'.repeat(2)}</div>
              <div class="mk-foot"></div>
            </div>
          </div>
          <figcaption>The same page on a phone. Most of your visitors will see this one, so it gets designed rather than squeezed.</figcaption>
        </figure>`,
};

/* -------------------------------------------------------------- render --- */

function chrome() {
  const src = fs.readFileSync(path.join(ROOT, CHROME_SOURCE), 'utf8');
  return {
    head: src.slice(0, src.indexOf('<main')),
    foot: src.slice(src.indexOf('</main>')),
  };
}

function renderHead(head, p) {
  const title = `${p.name} Website Subscription &mdash; Little Technical Solutions LLC`;
  const desc = `${p.name}: ${p.deposit} to start, then ${p.monthly}/month. ${p.tagline.replace(/<[^>]+>/g, '')} See exactly what's included, how it works, and what happens after you subscribe.`;
  return head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="https://lit-solutions.tech/plan-${p.slug}.html">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="https://lit-solutions.tech/plan-${p.slug}.html">`);
}

function li(rows) {
  return rows.map(([h, b]) => `            <li><strong>${h}</strong><span>${b}</span></li>`).join('\n');
}

function body(p) {
  const others = PLANS.filter(o => o.slug !== p.slug);
  return `
<main id="main">

  <section class="plan-hero${p.featured ? ' plan-hero--featured' : ''}">
    <div class="wrap">
      <p class="eyebrow"><a href="website-plans.html">Website plans</a> &rarr; ${p.name}</p>
      <h1>${p.name}: ${p.outcome}</h1>
      <p class="plan-hero-tagline">${p.tagline}</p>
      <div class="plan-hero-price">
        <span><strong>${p.dueToday}</strong> due today</span>
      </div>
      <p class="plan-hero-breakdown">${p.deposit} setup deposit + your first ${p.monthly} month. Then ${p.monthly}/month.</p>
      <p class="plan-hero-note">12-month minimum, then month to month. Your hosting, maintenance, security updates and support are included.</p>
      <div class="plan-hero-actions">
        <button type="button" class="btn btn-primary" data-add-to-cart="plan-${p.slug}" data-then="cart.html"><span data-cart-label>Start ${p.name}</span></button>
        <a href="#included" class="btn btn-ghost">See what's included</a>
      </div>
    </div>
  </section>

  <section id="included">
    <div class="wrap plan-narrow">
      <h2>Who this is for</h2>
      <p class="plan-lede">${p.who}</p>

      <h2>Pages you get</h2>
      <ul class="plan-pages">${p.pages.map(x => `<li>${x}</li>`).join('')}</ul>
    </div>
  </section>

  <section class="alt-bg">
    <div class="wrap plan-narrow">
      <h2>What it will look like</h2>
      <p class="plan-lede">These are wireframes, not finished designs &mdash; they show the structure and the features you're paying for. Your actual site is designed around your brand, your colours and your photographs. We have one live client site you can click around in on our <a href="portfolio.html">portfolio page</a>.</p>
      <div class="mockup-grid">${p.mockups.map(m => MOCKUPS[m](p)).join('\n')}
      </div>
    </div>
  </section>

  <section>
    <div class="wrap plan-narrow">
      <h2>Everything included in ${p.name}</h2>
      <ul class="plan-detail-list">
${li(p.detail)}
      </ul>

      <h2>And on every subscription plan</h2>
      <ul class="plan-detail-list">
${li(COMMON_INCLUDED)}
        <li><strong>Content changes</strong><span>${p.edits}</span></li>
      </ul>

      <p class="plan-anything">Anything from our <a href="website-designer.html">Website Designer</a> can be added to this plan &mdash; e-commerce, payments, CRM integration, multi-language, calendar sync. We fold it into your monthly price instead of charging a lump sum. Ask before you subscribe and we'll quote it.</p>
    </div>
  </section>

  <section class="alt-bg" id="subscribe">
    <div class="wrap plan-narrow">
      <h2>From checkout to launch</h2>
      <p class="plan-lede">Three clear steps. You approve the scope and the finished website before it goes live.</p>

      <ol class="plan-steps">
        <li>
          <h3>1. Choose ${p.name} and pay ${p.dueToday} today</h3>
          <p>Create your account and check out securely through Stripe. Today's total is the ${p.deposit} setup deposit plus your first ${p.monthly} month.</p>
        </li>
        <li>
          <h3>2. Complete a short brief and talk with us</h3>
          <p>Your project brief opens in your dashboard immediately. We call within one business day, confirm the pages and features, and send a written scope for your approval.</p>
        </li>
        <li>
          <h3>3. Review, approve and launch</h3>
          <p>We typically build ${p.slug === 'standard' ? 'in 1&ndash;2 weeks' : p.slug === 'premium' ? 'in 2&ndash;4 weeks' : 'in 3&ndash;6 weeks'} once we have your content. You review a private version first; after approval, we launch it and keep it running.</p>
        </li>
      </ol>

      <div class="plan-catch">
        <h3>How ownership works</h3>
        <ul class="plan-ownership-list">
          <li><strong>You always keep</strong> your domain, content, photographs, logo and business data.</li>
          <li><strong>We own and host the website build</strong> while the subscription is active. It is not rent-to-own.</li>
          <li><strong>The minimum term is 12 months.</strong> After that, the plan continues month to month. If it ends, the hosted site goes offline after written notice.</li>
          <li><strong>You can buy the website outright at any time.</strong> What you have already paid toward the plan is credited toward the buyout.</li>
        </ul>
        <p class="plan-catch-fine">Read the complete agreement in <a href="terms.html">Terms &amp; Conditions</a>, section 9, or <a href="pricing.html">compare one-time ownership</a>.</p>
      </div>

      <div class="plan-checkout">
        <h3>Get started with ${p.name}</h3>
        <p><strong>${p.dueToday} is due today:</strong> the ${p.deposit} setup deposit and your first ${p.monthly} month. Future billing is ${p.monthly}/month.</p>
        <div class="plan-checkout-actions">
          <button type="button" class="btn btn-primary" data-add-to-cart="plan-${p.slug}" data-then="cart.html"><span data-cart-label>Start ${p.name}</span></button>
          <a href="website-plans.html" class="btn btn-ghost">Compare all plans</a>
        </div>

        <p class="plan-checkout-alt">Rather talk to a person first? <a href="intake.html">Send us a note</a> or call <a href="tel:+18043090968">804-309-0968</a> &mdash; we answer seven days a week, 7:00am&ndash;7:00pm ET. Eligible for the <a href="heroes-pricing.html">American Heroes Discount</a>? Contact us before paying so we can confirm your rate.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap plan-narrow">
      <h2>The other plans</h2>
      <div class="plan-others">
${others.map(o => `        <a href="plan-${o.slug}.html" class="plan-other-card">
          <span class="plan-other-name">${o.name}</span>
          <span class="plan-other-price">${o.dueToday} today, then ${o.monthly}/month</span>
          <span class="plan-other-tagline">${o.tagline}</span>
          <span class="plan-other-cta">Learn more &rarr;</span>
        </a>`).join('\n')}
      </div>
    </div>
  </section>
`;
}

function comparisonBody() {
  return `
<main id="main">
  <section class="plan-hero plan-hero--featured">
    <div class="wrap">
      <p class="eyebrow">Website subscriptions</p>
      <h1>Choose the website your business needs now.</h1>
      <p class="plan-hero-tagline">Three clear plans. Custom design, hosting, maintenance, security updates and direct support are included in every one.</p>
      <div class="plan-hero-actions">
        <a href="#plans" class="btn btn-primary">Compare the plans</a>
        <a href="intake.html" class="btn btn-ghost">Help me choose</a>
      </div>
    </div>
  </section>

  <section id="plans">
    <div class="wrap">
      <header class="section-head">
        <p class="eyebrow">Pick by outcome</p>
        <h2>Start simple. Move up only when the website needs to do more.</h2>
        <p class="section-lede">The amount due today includes the setup deposit and your first month. Each plan has a 12-month minimum, then continues month to month.</p>
      </header>
      <div class="subscription-plan-grid website-plan-grid">
${PLANS.map(p => `        <article class="subscription-plan${p.featured ? ' subscription-plan--featured' : ''}">
${p.featured ? '          <span class="package-badge">Most popular</span>\n' : ''}          <p class="plan-card-outcome">${p.outcome}</p>
          <h3>${p.name}</h3>
          <p class="website-plan-due"><strong>${p.dueToday}</strong> due today</p>
          <p class="website-plan-breakdown">${p.deposit} setup + first ${p.monthly} month</p>
          <p class="website-plan-monthly">Then <strong>${p.monthly}/month</strong></p>
          <p class="subscription-plan-note">${p.tagline}</p>
          <ul class="subscription-features">
            ${p.pages.slice(0, p.slug === 'executive' ? 5 : 6).map(x => `<li>${x}</li>`).join('')}
            <li>Hosting, maintenance, security &amp; support</li>
          </ul>
          <div class="subscription-plan-actions">
            <button type="button" class="btn btn-primary" data-add-to-cart="plan-${p.slug}" data-then="cart.html"><span data-cart-label>Start ${p.name}</span></button>
            <a href="plan-${p.slug}.html" class="btn btn-ghost">See full details</a>
          </div>
        </article>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="alt-bg">
    <div class="wrap plan-narrow">
      <h2>How ownership works</h2>
      <ul class="plan-ownership-list plan-ownership-list--plain">
        <li><strong>You always keep</strong> your domain, content, logo, photographs and business data.</li>
        <li><strong>We own and host the build</strong> while your subscription is active.</li>
        <li><strong>You can buy it outright later</strong> and your plan payments are credited toward the buyout.</li>
      </ul>
      <p class="plan-lede">Prefer to own the website from day one? <a href="pricing.html#website-packages">Compare one-time packages from $699.</a></p>
    </div>
  </section>

  <section>
    <div class="wrap plan-narrow plan-help-card">
      <p class="eyebrow">Not sure?</p>
      <h2>Tell us what the website needs to accomplish.</h2>
      <p class="plan-lede">Send a short note or call 804-309-0968. We will recommend the smallest plan that does the job.</p>
      <div class="plan-hero-actions">
        <a href="intake.html" class="btn btn-primary">Help me choose</a>
        <a href="tel:+18043090968" class="btn btn-ghost">Call 804-309-0968</a>
      </div>
    </div>
  </section>
`;
}

/* ---------------------------------------------------------------- main --- */

// Copy + catalog prices, resolved once, so every reference below (including
// the "other plans" cards) quotes the same numbers.
const PLANS = PLAN_COPY.map(withPrices);

const { head, foot } = chrome();
let written = 0;
for (const p of PLANS) {
  const html = renderHead(head, p)
    + body(p)
    + foot;
  const file = path.join(ROOT, `plan-${p.slug}.html`);
  fs.writeFileSync(file, html, 'utf8');
  console.log(`  wrote plan-${p.slug}.html  (${(html.length / 1024).toFixed(1)} KB)`);
  written++;
}

const comparisonTitle = 'Website Subscription Plans &mdash; Little Technical Solutions LLC';
const comparisonDesc = 'Compare Standard, Premium and Executive website subscriptions. Clear due-today pricing, hosting, maintenance, security updates and direct support included.';
const comparisonHead = head
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${comparisonTitle}</title>`)
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${comparisonDesc}">`)
  .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://lit-solutions.tech/website-plans.html">')
  .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${comparisonTitle}">`)
  .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${comparisonDesc}">`)
  .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="https://lit-solutions.tech/website-plans.html">');
fs.writeFileSync(path.join(ROOT, 'website-plans.html'), comparisonHead + comparisonBody() + foot, 'utf8');
written++;
console.log('  wrote website-plans.html');

console.log(`\n${written} website plan pages generated from scripts/build-plan-pages.js`);
