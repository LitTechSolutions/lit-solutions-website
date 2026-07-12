# v1.13 — Business Tier Compliance Pass — What Changed

v1.12 upgraded the site's page set to the Business tier, but never checked the result against the
actual Business package requirements spec (`Business_Website_Master_Requirements.xlsx` /
`feature_manifest.json` in the `Claude/Business Package Software` reference folder). This pass
audited every Mandatory (M) requirement against the live site and closed every gap found — every
prior page's real content, links, and behavior stayed exactly as it was; this is additive.

## Rebrand
- Email updated everywhere: `dylan@littletechicalsolutions.com` → `dylan@lit-solutions.tech`
- Domain updated everywhere: `littletechicalsolutions.com` → `lit-solutions.tech`
- Facebook and "Find us on Google" links added to the footer on every page

## New pages (closing Mandatory requirement gaps)
- **Privacy Policy** (`privacy.html`) — what's collected, how it's used, cookies/analytics, your
  rights. There was previously no privacy page anywhere in the site's history.
- **Our Team** (`team.html`) — lighter, cross-linked companion to About, since the site had no
  dedicated team page.
- **Portfolio** (`portfolio.html`) — an honest "still building it out" placeholder in the same
  spirit as the existing Testimonials page, rather than fabricated project photos.
- **Sitemap** (`sitemap.html`) — a human-readable, grouped list of every page, distinct from the
  machine-readable `sitemap.xml` below.
- **404 page** (`404.html`) — branded, with a search box and links to popular pages, wired into
  `netlify.toml` as the not-found handler.
- **Search** (`search.html`) — client-side search with section filters over every page on the
  site (`search-index.json` + `js/search.js`). A search icon in the header links here from every
  page.

## Navigation & structure
- Breadcrumbs added to the 5 service-detail pages and all 3 blog articles
  (Home / Services / *page* and Home / Blog / *post*)
- In-page quick-jump navigation added to the 5 service-detail pages and the FAQ page
- "Our Team" and "Portfolio" added to the Resources dropdown; Search, Sitemap, and Privacy Policy
  added to the footer, on every page

## Trust, legal & compliance
- Cookie/tracking notice added site-wide — written honestly: this site doesn't set third-party
  tracking cookies, so it's framed as a transparency notice rather than an accept/reject gate for
  tracking that doesn't exist
- Facebook and Google Business Profile links added to the footer
- A Google Maps service-area embed added to the Contact page
- A short "send a quick message" contact form added directly to the Contact page (the detailed
  project form at `intake.html` is unchanged and still the primary intake path)

## SEO & discoverability
- Open Graph tags, Twitter card, canonical URL, and `LocalBusiness` structured data (JSON-LD)
  added to every page
- `sitemap.xml` and `robots.txt` added at the site root
- `netlify.toml` added: security headers (CSP, X-Frame-Options, Referrer-Policy,
  Permissions-Policy), the 404 redirect, and Netlify Forms stay auto-detected as before

## Analytics
- No client-side snippet was added. Per your choice, this site uses **Netlify Analytics** —
  enabled from the Netlify dashboard post-deploy, not from code, and it's cookie-free/server-side
  so it needed no consent-gating logic.

## Verification performed
- Every existing page's header/footer/content confirmed byte-identical apart from the intended
  rebrand, nav, and footer additions
- All new internal links checked against the actual file list (no dead links introduced)
- Spot-checked in-browser: dark/light mode, mobile nav, search, breadcrumbs, cookie notice, new
  pages, contact form + map — all render and behave as expected

## Things that still need your attention
1. **Netlify Analytics** — turn it on in the Netlify dashboard after deploy; nothing in the code
   needs to change.
2. **Portfolio page** — once you have 2–3 real completed projects you can show, send them over and
   the placeholder state can be swapped for real project cards (styling is already built).
3. **Google Business Profile link** — the link you gave me is a Google Search results deep-link
   for your business listing; if you later claim/verify a formal Google Business Profile with its
   own `g.page` or Maps link, swap that in for a cleaner, more stable URL.
4. **`LTS_SESSION_SECRET` / accounts module** — not part of this pass. Nothing in the selected
   scope required sign-in, so `lts_accounts_module/` was correctly left out per
   `ACCOUNTS_MODULE_NOTE.md`.
