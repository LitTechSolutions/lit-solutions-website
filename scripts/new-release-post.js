#!/usr/bin/env node
// Scaffolds a new "site update" blog post for a major release.
//
// Automates the mechanical parts only: captures clean screenshots of the
// pages you point it at, generates the article page from the site's
// established template, and registers it in blog.html, search-index.json,
// and sitemap.xml. It does NOT write the article body -- that needs real
// judgment about what changed and why it matters to a customer, which
// this script leaves as a clearly-marked placeholder for a human (or an
// AI session) to fill in.
//
// Usage:
//   node scripts/new-release-post.js \
//     --slug we-redesigned-our-website \
//     --title "We Redesigned Our Website" \
//     --excerpt "The whole site just got a full visual redesign." \
//     --category "Site Updates" \
//     --screenshot http://localhost:8090/index.html \
//     --screenshot http://localhost:8090/services.html
//
// Requires:
//   - A local static server serving this folder (e.g. `python3 -m http.server 8090`)
//   - Playwright's chromium browser installed once: `npx playwright install chromium`

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = { screenshots: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") args.slug = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--excerpt") args.excerpt = argv[++i];
    else if (a === "--category") args.category = argv[++i];
    else if (a === "--date") args.date = argv[++i];
    else if (a === "--screenshot") args.screenshots.push(argv[++i]);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function captureScreenshots(slug, urls) {
  if (!urls.length) return [];
  const outDir = path.join(ROOT, "assets", "blog");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const files = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      await page.goto(url, { waitUntil: "networkidle" });
      const cookieBtn = page.locator('#cookie-banner button[data-consent="dismiss"]');
      if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click();
      await page.waitForTimeout(600); // let hero rotator word / reveals settle
      const filename = `${slug}-${i + 1}.png`;
      await page.screenshot({ path: path.join(outDir, filename), clip: { x: 0, y: 0, width: 1600, height: 820 } });
      files.push(`assets/blog/${filename}`);
      console.log(`  captured ${filename} <- ${url}`);
    }
  } finally {
    await browser.close();
  }
  return files;
}

function buildArticleHtml({ slug, title, excerpt, category, date, screenshotFiles }) {
  const imageBlocks = screenshotFiles
    .map(
      (f) =>
        `        <img src="${f}" alt="TODO: describe what this screenshot shows" style="width:100%; border-radius:var(--radius); border:1px solid var(--line); margin:2rem 0;">`
    )
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Little Technical Solutions LLC</title>
<meta name="description" content="${escapeHtml(excerpt)}">
<link rel="canonical" href="https://lit-solutions.tech/${slug}.html">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Little Technical Solutions LLC">
<meta property="og:title" content="${escapeHtml(title)} — Little Technical Solutions LLC">
<meta property="og:description" content="${escapeHtml(excerpt)}">
<meta property="og:url" content="https://lit-solutions.tech/${slug}.html">
${screenshotFiles[0] ? `<meta property="og:image" content="https://lit-solutions.tech/${screenshotFiles[0]}">` : ""}
<meta name="twitter:card" content="summary_large_image">

<link rel="stylesheet" href="css/style.css">
<link rel="icon" type="image/png" href="assets/favicon.png">
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" id="siteHeader">
  <div class="wrap header-inner">
    <a href="index.html" class="logo" aria-label="Little Technical Solutions LLC — home">
      <span class="logo-mark" aria-hidden="true">
        <img src="assets/logo-icon.png" alt="" width="40" height="40">
      </span>
      <span class="logo-text">
        <span class="logo-line1">Little Technical</span>
        <span class="logo-line2">Solutions <span class="logo-llc">LLC</span></span>
      </span>
    </a>

    <nav class="main-nav" id="mainNav" aria-label="Primary">
      <a href="index.html">Home</a>
      <div class="nav-dropdown">
        <button type="button" class="nav-dropdown-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="servicesDropdown">
          <span>Services</span>
          <svg class="nav-dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-dropdown-menu" id="servicesDropdown">
          <a href="services.html">All Services</a>
          <a href="service-website.html">Website Design &amp; Development</a>
          <a href="service-computer.html">Computer Repair</a>
          <a href="service-networking.html">Networking</a>
          <a href="service-cybersecurity.html">Cybersecurity</a>
          <a href="service-business-it.html">Small Business IT</a>
          <a href="pricing.html">Pricing</a>
        </div>
      </div>
      <a href="website-designer.html">Website Designer</a>
      <a href="about.html">About</a>
      <a href="contact.html">Contact</a>
    </nav>

    <div class="header-actions">
      <a href="search.html" class="search-toggle" aria-label="Search this site" title="Search this site">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-3.8-3.8"/></svg>
      </a>
      <a href="myaccount.html" class="search-toggle" aria-label="Client Sign In" title="Client Sign In">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </a>
      <a href="tel:+18043090968" class="phone-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        804-309-0968
      </a>
      <a href="intake.html" class="btn btn-primary btn-small">Request Service</a>
    </div>

    <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="mainNav" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>
<main id="main">
  <section class="page-hero">
    <div class="wrap">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="index.html">Home</a><span class="sep">/</span><a href="blog.html">Blog</a><span class="sep">/</span><span aria-current="page">${escapeHtml(title)}</span></nav>
      <p class="eyebrow">${escapeHtml(category)}</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
  </section>

  <section>
    <div class="wrap">
      <article class="blog-article-body">
        <p class="blog-article-meta">${date} &middot; ${escapeHtml(category)}</p>

        <!-- TODO: write the actual article body. Explain what changed and,
             more importantly, why it's a genuine benefit to the customer
             reading this -- not just a list of technical changes. Keep the
             site's plain-language, no-exaggeration voice (see CLAUDE.md).
             The patch-notes.html entry for this same release is the
             technical changelog; this post is the customer-facing story. -->
        <p>TODO: opening paragraph -- what happened, in one or two sentences.</p>

${imageBlocks || "        <!-- No screenshots were captured. Re-run with --screenshot <url> to add some. -->"}

        <h2>TODO: what actually changed</h2>
        <p>TODO.</p>

        <h2>TODO: why it matters to you</h2>
        <p>TODO.</p>
      </article>
    </div>
  </section>

  <section class="alt-bg">
    <div class="wrap">
      <header class="section-head">
        <p class="eyebrow">Keep reading</p>
        <h2>More from the blog</h2>
      </header>
      <p style="text-align:center;"><a href="blog.html" class="btn btn-ghost">All articles</a></p>
    </div>
  </section>

</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <img src="assets/logo-icon.png" alt="Little Technical Solutions LLC" width="36" height="36" class="footer-logo">
      <span class="logo-line1">Little Technical Solutions LLC</span>
      <p>Websites, computers, networks, and security — handled by one call.</p>
    </div>
    <nav class="footer-nav" aria-label="Footer">
      <a href="index.html">Home</a>
      <a href="services.html">Services</a>
      <a href="website-designer.html">Website Designer</a>
      <a href="pricing.html">Pricing</a>
      <a href="heroes-pricing.html">Heroes Discount</a>
      <a href="about.html">About</a>
      <a href="team.html">Our Team</a>
      <a href="service-area.html">Service Area</a>
      <a href="faq.html">FAQ</a>
      <a href="blog.html">Blog</a>
      <a href="payment.html">Payments</a>
      <a href="contact.html">Contact</a>
      <a href="intake.html">New Client Form</a>
      <a href="search.html">Search</a>
      <a href="sitemap.html">Sitemap</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="terms.html">Terms &amp; Conditions</a>
      <a href="patch-notes.html">Website Updates</a>
      <a href="#" id="manageConsentLink">Cookie Notice</a>
    </nav>
    <nav class="footer-social" aria-label="Social">
      <a href="https://www.facebook.com/profile.php?id=61591618750945" rel="noopener" target="_blank" aria-label="Little Technical Solutions LLC on Facebook">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>
        <span>Facebook</span>
      </a>
      <a href="https://www.google.com/search?q=Little+Technical+Solutions+LLC&stick=H4sIAAAAAAAA_-NgU1IxqDA0N0s1sUgyT0yxTE1NTLMyqEg2sTRLNTZOTTS1NDIzSUxaxCrnk1lSkpOqEJKanJGXmZyYoxCcn1NakpmfV6zg4-MMAGRkPw5JAAAA&hl=en&mat=CWEgdKX6xe4RElcBa0lj_4PsrYDUx2O2vFBpnokVltXIVrcy43xjezZrcYTprxRsgJGT1ATelPpH5ss3Sn-4VrXJHi_xxw10Eq_jzvWCxQfPf2G4feie7XZe-MJ3uWuSvN4&authuser=0" rel="noopener" target="_blank" aria-label="Little Technical Solutions LLC on Google">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 12.23c0-.75-.07-1.47-.19-2.18H12v4.13h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 3-4.32 3-7.47z"/><path d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.58A10 10 0 0 0 12 22z"/><path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.05a10 10 0 0 0 0 8.96l3.35-2.58z"/><path d="M12 6.08c1.47 0 2.79.5 3.83 1.5l2.87-2.87A10 10 0 0 0 3.05 7.52L6.4 10.1c.8-2.36 3-4.02 5.6-4.02z"/></svg>
        <span>Find us on Google</span>
      </a>
    </nav>
  </div>
  <p class="footer-legal">&copy; <span id="year"></span> Little Technical Solutions LLC. All rights reserved.</p>
  <p class="footer-version"><a href="patch-notes.html">Website Version <span id="siteVersion">4.0.0</span></a></p>
  <p class="footer-version"><a href="/care-hub/login">Staff Sign In</a></p>
</footer>

<div id="cookie-banner" class="cookie-banner" hidden role="region" aria-label="Cookie notice">
  <div class="wrap cookie-banner-inner">
    <p>We use Netlify Analytics (cookie-free, privacy-respecting) to see site traffic. Nothing here is used for advertising or sold to anyone. See our <a href="privacy.html">Privacy Policy</a>.</p>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-primary btn-small" data-consent="dismiss">Got it</button>
    </div>
  </div>
</div>

<script src="js/main.js"></script>
<script src="js/site-version.js"></script>
</body>
</html>
`;
}

function registerInBlogGrid({ slug, title, excerpt, category, date, thumb }) {
  const blogPath = path.join(ROOT, "blog.html");
  let html = fs.readFileSync(blogPath, "utf8");
  const cardHtml = `        <a href="${slug}.html" class="blog-card reveal">
          ${thumb ? `<img class="blog-card-art" src="${thumb}" alt="">` : `<div class="blog-card-art"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4z" opacity="0"/><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 13h8M8 16h5"/></svg></div>`}
          <div class="blog-card-body">
            <div class="blog-card-meta">${date} &middot; ${escapeHtml(category)}</div>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(excerpt)}</p>
            <span class="card__link">Read more &rarr;</span>
          </div>
        </a>
`;
  const marker = '      <div class="blog-grid">\n';
  const idx = html.indexOf(marker);
  if (idx === -1) fail('Could not find <div class="blog-grid"> in blog.html -- has its structure changed?');
  html = html.slice(0, idx + marker.length) + cardHtml + html.slice(idx + marker.length);
  fs.writeFileSync(blogPath, html);
  console.log("  updated blog.html");
}

function registerInSearchIndex({ slug, title, excerpt }) {
  const idxPath = path.join(ROOT, "search-index.json");
  const items = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  const blogEntryIndex = items.findIndex((i) => i.href === "blog.html");
  const entry = { title, href: `${slug}.html`, scope: "Resources", excerpt };
  if (blogEntryIndex === -1) items.push(entry);
  else items.splice(blogEntryIndex + 1, 0, entry);
  fs.writeFileSync(idxPath, JSON.stringify(items, null, 2) + "\n");
  console.log("  updated search-index.json");
}

function registerInSitemap({ slug }) {
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  let xml = fs.readFileSync(sitemapPath, "utf8");
  const marker = "  <url><loc>https://lit-solutions.tech/blog.html</loc><priority>0.6</priority></url>\n";
  const newLine = `  <url><loc>https://lit-solutions.tech/${slug}.html</loc><priority>0.4</priority></url>\n`;
  if (!xml.includes(marker)) fail("Could not find the blog.html <url> entry in sitemap.xml -- has its structure changed?");
  xml = xml.replace(marker, marker + newLine);
  fs.writeFileSync(sitemapPath, xml);
  console.log("  updated sitemap.xml");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) fail("--slug is required, e.g. --slug we-redesigned-our-website");
  if (!args.title) fail("--title is required");
  if (!args.excerpt) fail("--excerpt is required");
  if (!/^[a-z0-9-]+$/.test(args.slug)) fail("--slug must be lowercase letters, numbers, and hyphens only");

  args.category = args.category || "Site Updates";
  args.date = args.date || todayISO();

  const articlePath = path.join(ROOT, `${args.slug}.html`);
  if (fs.existsSync(articlePath)) fail(`${args.slug}.html already exists -- pick a different --slug or delete it first.`);

  console.log(`Capturing ${args.screenshots.length} screenshot(s)...`);
  const screenshotFiles = await captureScreenshots(args.slug, args.screenshots);

  console.log("Generating article page...");
  fs.writeFileSync(articlePath, buildArticleHtml({ ...args, screenshotFiles }));

  console.log("Registering the post...");
  registerInBlogGrid({ ...args, thumb: screenshotFiles[0] });
  registerInSearchIndex(args);
  registerInSitemap(args);

  console.log(`
Done. Next steps:
  1. Open ${args.slug}.html and replace the TODO placeholders with the real
     article -- what changed, and why it's a genuine benefit to the reader.
     Keep the site's plain-language, no-exaggeration voice.
  2. If you captured screenshots, write real alt text for each <img> (currently
     "TODO: describe what this screenshot shows").
  3. Run "npm test" to confirm nothing broke.
  4. Preview the page and blog.html locally before committing.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
