# Admin CMS + customer accounts setup (v1.18)

This site has a sign-in-protected staff dashboard at `/admin.html` and a public
customer portal at `/myaccount.html`, both backed by Netlify Functions +
Netlify Blobs. This doc is the one-time setup checklist for both.

## 1. Install the dependency

```bash
npm install
```

This installs `@netlify/blobs` (declared in `package.json`). Netlify will also
run this automatically during its own build if you don't run it yourself first.

## 2. Set the session secret

In the Netlify dashboard: **Site settings > Environment variables**, add:

```
LTS_SESSION_SECRET = <a random 64-character hex string>
```

Generate one locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit this value to the repo. Without it, every function in
`netlify/functions/` will throw on the first request.

## 3. (Recommended) Set up email sending

Every new account — staff or customer — now has to verify their email before
they can sign in, which is the main defense against bot/junk registrations on
`myaccount.html` (registration is open to the public there). Without an email
provider configured, verification links just get logged to the function
console instead of delivered — the site still works, but you'll need to fetch
tokens from the Netlify Blobs dashboard by hand (see step 6 and "Forgot your
password?" below), which doesn't scale past testing it yourself.

To wire up real delivery, this site uses [Resend](https://resend.com) (a
single HTTP call, no SDK/dependency needed — see
`netlify/functions/_lib/email.js`):

1. Sign up at resend.com (free tier: 3,000 emails/month, 100/day — plenty for
   this site).
2. Add and verify `lit-solutions.tech` as a sending domain (Resend gives you
   DNS records to add wherever your domain is hosted).
3. Create an API key.
4. In the Netlify dashboard, add two more environment variables:
   ```
   RESEND_API_KEY = <the API key from step 3>
   EMAIL_FROM     = Little Technical Solutions LLC <dylan@lit-solutions.tech>
   ```
5. (Optional but recommended) Add one more so you get emailed when a customer
   messages you, instead of only seeing it in the admin inbox:
   ```
   ADMIN_NOTIFY_EMAIL = dylan@lit-solutions.tech
   ```

If you'd rather use a different provider (Mailgun, SendGrid, Postmark,
etc.), swap the implementation in `_lib/email.js` — everything else in the
codebase calls `sendEmail({to, subject, html})` and doesn't care which
provider is behind it.

## 4. Deploy

Deploy as normal (`netlify deploy` or your usual Git-connected flow).
`netlify.toml` already has the `[functions]` block pointing at
`netlify/functions`, so Netlify picks up the functions automatically — nothing
else to configure there.

## 5. Create your staff account (one time only)

1. Go to `https://yourdomain/admin.html#register`.
2. Fill in your name, email, and a password (10+ characters).
3. **Verify it.** If you completed step 3 above, check your email for the
   verification link. If not, find the token yourself: Netlify dashboard >
   your site > **Blobs** > `tokens` store > find the most recent key (its
   value has `"type":"verify-email"` and your user id), then open
   `admin.html#verify?token=<that token>`.
4. Registration stays open after this — it's the same open sign-up
   `myaccount.html` uses for customers (see below). A random new account
   created by someone else is harmless on its own: it's role `customer` by
   default and has zero staff access unless you promote it yourself in the
   next step.

## 6. Promote yourself to admin

Verifying your email is not the same as becoming staff — there's no
self-service way to become `admin`, on purpose. To finish setup:

1. Netlify dashboard > your site > **Blobs**.
2. Open the **`users`** store.
3. Find the key matching your email (lowercased), open it, and change
   `"role": "customer"` to `"role": "admin"`.
4. Save.

## 7. Sign in and use it

Go to `https://yourdomain/admin.html#signin` (or click **Staff Sign In** in
the footer of any page — it's deliberately not in the main navigation, since
this is for you, not visitors). From the dashboard you can manage:

- **Blog Posts** — title, URL slug, category, date, excerpt, full article
  body, and an optional featured photo. Saved posts show up on `blog.html`
  automatically (newest first, above the 3 original articles) and get their
  own page at `blog-post.html?slug=your-slug`.
- **Portfolio** — title, description, optional photo. As soon as you add one,
  it replaces the "still building it out" placeholder on `portfolio.html`.
- **Gallery** — a plain photo grid at `gallery.html`, separate from Portfolio
  (which is project write-ups). Photo and alt text are required; caption is
  optional. Nothing shows on the public page until the first photo is added.
- **Testimonials** — quote, author, role/company. Same pattern — the first
  one you add replaces the honest placeholder on `testimonials.html`.
- **Image Library** — a running list of everything you've uploaded, for
  reference. You don't need to use this directly; each item's own form has
  its own photo upload built in.
- **Customers** — an inbox of every customer conversation (newest first,
  with unread counts), a lookup box to pull up any customer by email, and
  from there: upload documents for them (title, type, amount, status, date,
  notes, optional PDF/image attachment), read/reply to their messages, and
  send a one-off **notification** (e.g. "Appointment rescheduled") for
  anything that doesn't need a back-and-forth reply. Uploading a document
  also raises a notification automatically. See "Customer accounts" below
  for the customer side of this.
- **Account Settings** — change your own login email or password, right
  from the dashboard (each requires your current password, and signs you
  out afterward so you sign back in with the new credentials). This is the
  normal way to update your login going forward — you only need the
  Netlify Blobs dashboard for the one-time initial promotion to admin in
  step 6 above.

Everything saves immediately and is live on the site the moment you click
**Save changes** — no rebuild, no redeploy.

## Customer accounts (myaccount.html)

Separate from your own staff login, customers can create their own accounts:

1. Anyone can register at `myaccount.html#register` — open to the public
   (unlike `admin.html`'s registration form, which only you should ever use).
   New accounts default to role `customer` and have no admin/staff access,
   ever, regardless of how they signed up.
2. They have to verify their email (see step 3 above) before they can sign
   in at all — this is the main anti-bot measure for open registration.
3. **Documents.** To attach an invoice, receipt, or other document to a
   customer, they need to have registered (and verified) first. Go to
   **Customers** in `admin.html`, look them up by email, and upload. They
   see it — with a download link for any attached file — at
   `myaccount.html#dashboard`.
4. **Messages.** Customers can message you from `myaccount.html#messages`.
   You'll see it in the **Customers** inbox in `admin.html` (and get an
   email if you set `ADMIN_NOTIFY_EMAIL`), and can reply from the same
   lookup panel — it's a real back-and-forth thread, not a one-off contact
   form. This is separate from the existing Contact page form, which is
   still there for anonymous visitors who don't want to create an account.
5. Customers can also update their own email/password from
   `myaccount.html#profile` — same self-service pattern as your Account
   Settings tab. That page also has a name field (no password needed) and
   preferences (language, timezone, and an "email me about new messages/
   documents" toggle) — turning that toggle off stops the message-reply and
   document-upload emails but never the in-app notification, so nothing is
   silently missed.
6. **Dashboard, Favorites &amp; Notifications.** `myaccount.html#dashboard`
   is a real hub (document/favorite/unread-notification counts, recently
   viewed). Customers can bookmark blog posts and portfolio items (button
   only shows once signed in) and save searches from `search.html` — both
   live in `myaccount.html#favorites`. `myaccount.html#notifications` is a
   one-way alert list (separate from Messages), with an unread badge on
   the nav tab.

A customer can only ever see their own documents, messages, favorites, and
notifications — this is enforced on the server, not just hidden in the
interface, and was verified directly (see `CHANGES-v1.15.md` through
`CHANGES-v1.17.md`).

## Forgot your password?

`admin.html#reset-request` (staff) or `myaccount.html#reset-request`
(customers) generates a reset token, but automatic email delivery only
works if you completed step 3 above. Without it, find the token yourself:
Netlify dashboard > **Blobs** > `tokens` store (most recent key with
`"type":"password-reset"`), then open `admin.html#reset?token=<that token>`
or `myaccount.html#reset?token=<that token>`. A customer who can't do this
themselves will need to call or email you.

## Known limitations, honestly

- **Email delivery is opt-in.** Verification links, password resets, and
  message notifications all work without a provider configured — they just
  log instead of send, meaning you (or the customer) have to fetch the
  token from the Netlify Blobs dashboard by hand. Fine for testing, not for
  real customers at any real volume — set up Resend (step 3) before you
  expect real people to use `myaccount.html`.
- **Blog post SEO is templated, not per-page.** The 3 original blog articles
  are real static HTML pages with their own title/description/Open Graph
  tags. Posts you add through the admin panel all share one template
  (`blog-post.html`) — Google still indexes them fine (it renders JS), but
  link previews on Facebook/etc. will show generic text instead of that
  post's actual title and excerpt.
- **No image resizing/optimization.** Photos and document attachments are
  stored as base64 in Netlify Blobs, capped around 3.5MB each. Keep files
  reasonably sized before uploading for the best page-load speed.
- **No CAPTCHA.** Email verification plus the existing rate limits
  (10 registrations/hour/IP, 8 sign-in attempts/5 min/IP) are the current
  anti-bot measures on open registration. If spam registrations become a
  real problem later, adding hCaptcha or Cloudflare Turnstile to
  `myaccount.html#register` would be the next layer — not built now since
  it wasn't asked for and needs its own third-party signup.
