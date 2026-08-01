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

const ROOT = path.join(__dirname, '..');
const CHROME_SOURCE = 'service-website.html';

/* ---------------------------------------------------------------- data --- */

const COMMON_INCLUDED = [
  ['Hosting, deployment &amp; SSL', 'Your site lives on fast, modern infrastructure with HTTPS configured properly. Nothing for you to set up or renew.'],
  ['Security updates', 'Dependencies and platform patches are applied as they land, not when something breaks.'],
  ['Automated backups', 'Taken on a rolling schedule so a bad edit or a bad day is recoverable.'],
  ['Uptime monitoring', 'We find out your site is down before you do.'],
  ['Support by phone, text or email', 'Seven days a week, 7:00am&ndash;7:00pm ET. You get a person, not a ticket queue.'],
];

const PLANS = [
  {
    slug: 'standard',
    name: 'Standard',
    deposit: '$149',
    monthly: '$79',
    depositLink: 'https://square.link/u/lwgSQrWM',
    subLink: 'https://square.link/u/fLTqZg7k',
    equivalent: 'Starter',
    equivalentPrice: '$699',
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
    deposit: '$249',
    monthly: '$129',
    depositLink: 'https://square.link/u/GaFznrtG',
    subLink: 'https://square.link/u/Y40Brp2x',
    equivalent: 'Business',
    equivalentPrice: '$1,299',
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
    deposit: '$399',
    monthly: '$199',
    depositLink: 'https://square.link/u/av8VJj8O',
    subLink: 'https://square.link/u/izfCOOLP',
    equivalent: 'Business plus accounts, admin tooling and hardening',
    equivalentPrice: 'about $2,500',
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
      <p class="eyebrow"><a href="pricing.html#website-subscription">Website Subscription</a> &rarr; ${p.name}</p>
      <h1>${p.name}</h1>
      <p class="plan-hero-tagline">${p.tagline}</p>
      <div class="plan-hero-price">
        <span><strong>${p.deposit}</strong> to start</span>
        <span class="plan-hero-plus">then</span>
        <span><strong>${p.monthly}</strong>/month</span>
      </div>
      <p class="plan-hero-note">12-month minimum, then month to month. Equivalent one-off build: ${p.equivalent} (${p.equivalentPrice}) &mdash; <a href="pricing.html">compare buying outright</a>.</p>
      <a href="#subscribe" class="btn btn-primary">Jump to how it starts &amp; sign up</a>
    </div>
  </section>

  <section>
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
      <h2>How this actually starts</h2>
      <p class="plan-lede">No surprises about what happens after you pay. This is the whole process.</p>

      <ol class="plan-steps">
        <li>
          <h3>1. Create your account</h3>
          <p>Email and password, then a 6-digit code we email you straight away. It takes about a minute, and it's what gives you a dashboard, an inbox and a place for your paperwork.</p>
        </li>
        <li>
          <h3>2. Pay the ${p.deposit} deposit from your dashboard</h3>
          <p>Through Square, as normal. The deposit isn't an extra fee &mdash; it's what reserves your build slot. Your ${p.monthly}/month plan starts alongside it.</p>
        </li>
        <li>
          <h3>3. Fill in your project brief</h3>
          <p>It lands in your dashboard inbox the moment your payment is in &mdash; what your business does, who it's for, what you already have. A copy is saved to your Documents tab, and it's what we build from.</p>
        </li>
        <li>
          <h3>4. We call you within one business day</h3>
          <p>A real conversation about your business, what the site needs to do, and what you already have &mdash; logo, photographs, existing copy. If you have none of that, we'll tell you what we need and how to get it.</p>
        </li>
        <li>
          <h3>5. You get a written scope of work</h3>
          <p>Exactly what's being built, the pages, the features, and the timeline. <strong>It also states in writing that this is a subscription plan and what that means for ownership.</strong> Nothing is built until you've approved it.</p>
        </li>
        <li>
          <h3>6. We build it, and you review it</h3>
          <p>Typically ${p.slug === 'standard' ? '1&ndash;2 weeks' : p.slug === 'premium' ? '2&ndash;4 weeks' : '3&ndash;6 weeks'} once we have your content. You see it on a private link before anyone else does, and you get revisions before launch.</p>
        </li>
        <li>
          <h3>7. It goes live, and we keep it running</h3>
          <p>We handle the domain, hosting, SSL, and everything on the list above from that point on. You call us when you want something changed.</p>
        </li>
      </ol>

      <div class="plan-catch">
        <h3>Before you pay, the trade-off in plain English</h3>
        <p><strong>On a subscription plan we own the website build and license it to you for as long as you're subscribed.</strong> That is the trade for paying ${p.deposit} instead of ${p.equivalentPrice} upfront. It is not rent-to-own and it does not become yours over time.</p>
        <p><strong>If the subscription ends, we stop hosting the site and it goes offline</strong> &mdash; always after written notice, never as a surprise.</p>
        <p><strong>Yours regardless, in every circumstance, free:</strong> your domain, your content (text, photographs, logo, anything you gave us or added), and your business data including every enquiry the site collected. If we registered your domain it is in <em>your</em> name from day one, and you get at least 30 days' written notice before we stop covering the renewal.</p>
        <p><strong>You can buy it outright whenever you like</strong> &mdash; we quote what the build would have cost as a one-off, less everything you've already paid us. Nothing you've paid is wasted.</p>
        <p class="plan-catch-fine">Full terms: <a href="terms.html">Terms &amp; Conditions</a>, section 9. If you'd rather own it from day one, our <a href="pricing.html">one-off packages</a> start at $699 and over a few years cost less.</p>
      </div>

      <div class="plan-checkout">
        <h3>Get started with ${p.name}</h3>
        <p>Add it to your cart and you'll create an account at checkout &mdash; that's what gives you a dashboard to pay from, a place for your project brief, and somewhere your paperwork lives afterwards.</p>
        <div class="plan-checkout-actions">
          <button type="button" class="btn btn-primary" data-add-to-cart="${p.slug}" data-then="cart.html"><span data-cart-label>Add ${p.name} to cart</span></button>
          <a href="cart.html" class="btn btn-ghost">View cart</a>
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
          <span class="plan-other-price">${o.deposit} to start, then ${o.monthly}/month</span>
          <span class="plan-other-tagline">${o.tagline}</span>
          <span class="plan-other-cta">Learn more &rarr;</span>
        </a>`).join('\n')}
      </div>
    </div>
  </section>

</main>
`;
}

/* ---------------------------------------------------------------- main --- */

const { head, foot } = chrome();
let written = 0;
for (const p of PLANS) {
  const html = renderHead(head, p)
    + body(p)
    + foot.replace('<script src="js/main.js"></script>',
        '<script src="js/main.js"></script>\n<script src="js/subscribe-flow.js"></script>');
  const file = path.join(ROOT, `plan-${p.slug}.html`);
  fs.writeFileSync(file, html, 'utf8');
  console.log(`  wrote plan-${p.slug}.html  (${(html.length / 1024).toFixed(1)} KB)`);
  written++;
}
console.log(`\n${written} plan pages generated from scripts/build-plan-pages.js`);
