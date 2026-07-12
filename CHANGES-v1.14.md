# v1.14 — Payments Merge + Admin Content Editor — What Changed

## Payments & Subscriptions merged into one tab
- `payment.html` and `subscriptions.html` are now a single **Payments** page
  with two collapsible sections — "One-Time Payment" and "Subscriptions" —
  using the same accordion pattern already on the Pricing page
- Old `/subscriptions.html` links redirect (301) to `/payment.html#subscriptions`,
  which auto-opens the right section
  and scrolls to it
- Header/footer nav simplified from two links ("Subscriptions", "Make a
  Payment") down to one ("Payments")
- All 3 live Square links (payment, Website Care Plan, Small Business IT)
  carried over unchanged

## New: sign-in-protected admin content editor
Added a real admin panel at `/admin.html` (linked as a low-key "Staff Sign
In" footer link, not in the main nav) backed by Netlify Functions + Netlify
Blobs — see `README_ADMIN_SETUP.md` for the one-time setup steps
(env var, npm install, register, promote to admin).

From the dashboard you can now:
- **Add/edit/delete/reorder blog posts** — title, slug, category, date,
  excerpt, full body, optional photo. New posts appear on `blog.html`
  automatically and get their own page via the new `blog-post.html` template
- **Add/edit/delete/reorder portfolio items** — title, description, optional
  photo. The first one you add replaces the honest "still building it out"
  placeholder on `portfolio.html`
- **Add/edit/delete/reorder testimonials** — quote, author, role/company.
  Same pattern, replaces the placeholder on `testimonials.html` once you add one
- **Update your own login email and password** — an Account Settings tab
  lets you change either one directly from the dashboard (each requires
  re-entering your current password, and signs you out afterward so you
  re-authenticate with the new credentials) — no need to touch the Netlify
  Blobs dashboard for routine changes, only for the one-time initial
  promotion to admin
- **Upload and manage photos** — a personal image library, or upload directly
  inline on any post/portfolio item's form

Everything saves instantly and shows up on the live site immediately — no
rebuild or redeploy needed. Until you add anything, every page's existing
content and honest placeholders are completely unchanged.

## New files
- `admin.html` — the editor itself (self-contained, matches the site's design system)
- `blog-post.html` — dynamic template for admin-added blog posts
- `js/cms.js` — fetch-and-render glue between the content API and the public pages
- `netlify/functions/` — `content.js`, `admin-images.js`, `account.js`,
  `auth-login.js`, `auth-register.js`, `auth-logout.js`,
  `auth-password-reset.js`, and `_lib/auth_utils.js` / `_lib/blob_store.js`
- `package.json` — declares the `@netlify/blobs` dependency
- `README_ADMIN_SETUP.md` — setup checklist (env var, first registration,
  promoting yourself to admin, known limitations)

## Security notes
- Sessions use HttpOnly, Secure, SameSite=Lax cookies; passwords are hashed
  with scrypt; sign-in/register/password-reset are all rate-limited
- Registration closes itself after the first account is created — there's no
  legitimate use for a second account on this site, so the endpoint refuses
  further sign-ups rather than leaving an open door
- Content reads (what powers the public pages) are intentionally
  unauthenticated — there's nothing sensitive in blog/portfolio/testimonial
  data, and every visitor's browser needs to fetch it. Writes require an
  admin/staff session, checked server-side, not just hidden in the UI

## Verification performed
- Full register → promote → login → wrong-password-rejected → content
  read/write → role-gating → image upload → password-reset (with session
  revocation) → logout → rate-limiting flow tested end-to-end against an
  in-memory mock of the Netlify Blobs API (24/24 checks passing)
- Every function file passes `node --check`
- Full flow re-verified against a real local HTTP server running the actual
  function code (not just the mock harness): registered, promoted, signed
  in, and saved real blog/portfolio/testimonial content via `curl`, then
  confirmed it rendered correctly on the live pages in-browser — including
  the graceful fallback to each page's original placeholder when no content
  has been added yet
- Automated link-integrity check: 0 broken internal links across all 31 pages
- Manual code review of the admin editor's add/edit/delete/reorder logic

## Things that need your attention before/after launch
1. **Complete the setup checklist in `README_ADMIN_SETUP.md`** — the site
   won't have a working admin login until `LTS_SESSION_SECRET` is set and
   you've registered + promoted your account.
2. **Password reset email isn't automated** — see the workaround in
   `README_ADMIN_SETUP.md` until you wire up a real email provider.
3. **Blog post link previews are generic for admin-added posts** — see
   "Known limitations" in `README_ADMIN_SETUP.md`.
