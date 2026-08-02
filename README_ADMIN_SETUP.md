# Admin workspace + customer accounts setup

This site has one account path at `/myaccount.html`. Customers see their own
purchases, documents, and messages; administrators see the operations
workspace after completing an emailed security-code check. Both are backed by
Netlify Functions + Netlify Blobs.

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

## 3. If functions return 502 with a Blobs error, add a manual token

Netlify normally wires up Blobs storage access to every function
automatically — no config needed. On some deploys that auto-detection
doesn't kick in, and every function call fails with `502` and
`MissingBlobsEnvironmentError` in the function's logs (Site > Logs >
Functions > pick a function). If you hit that:

1. Netlify dashboard (top-right avatar) > **User settings** > **Applications**
   > **Personal access tokens** > **New access token**. Name it something
   like `lit-solutions-blobs`, no expiration needed unless you want one.
2. Copy the token, then in this site's **Site settings > Environment
   variables**, add:
   ```
   NETLIFY_BLOBS_TOKEN = <the token from step 1>
   ```
3. **Deploys** tab > **Trigger deploy** > **Deploy site** (environment
   variable changes need a fresh deploy to reach already-bundled functions).

`SITE_ID` is already set automatically by Netlify for every function — you
only need to add the token above.

## 4. Set up email sending (required for administrator access)

Every new account — staff or customer — now has to verify their email before
they can sign in, which is the main defense against bot/junk registrations on
`myaccount.html` (registration is open to the public there). Administrator
sign-in also sends a one-time six-digit code and fails closed if delivery is
not configured or the provider rejects the message. Configure email before
promoting the owner account in step 7.

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

## 5. Deploy

Deploy as normal (`netlify deploy` or your usual Git-connected flow).
`netlify.toml` already has the `[functions]` block pointing at
`netlify/functions`, so Netlify picks up the functions automatically — nothing
else to configure there.

## 6. Create your own account (one time only)

There's deliberately no separate "create a staff account" form anymore --
Dylan is the only person who will ever have admin access, so the one
account he needs is created the same way any customer account is, then
promoted to admin in step 7.

1. Go to `https://yourdomain/myaccount.html#register`.
2. Fill in your name, email, and a password (10+ characters).
3. **Verify it.** If you completed step 4 above, check your email for the
   verification link. If not, find the token yourself: Netlify dashboard >
   your site > **Blobs** > `tokens` store > find the most recent key (its
   value has `"type":"verify-email"` and your user id), then open
   `myaccount.html#verify?token=<that token>`.
4. This account is role `customer` by default and has zero staff access
   until you promote it yourself in the next step.

## 7. Promote yourself to admin

Verifying your email is not the same as becoming staff — there's no
self-service way to become `admin`, on purpose. To finish setup:

1. Netlify dashboard > your site > **Blobs**.
2. Open the **`users`** store.
3. Find the key matching your email (lowercased), open it, and change
   `"role": "customer"` to `"role": "admin"`.
4. Save.

## 8. Sign in and use it

Go to `https://yourdomain/myaccount.html#signin` (or click **Staff Sign In** in
the footer of any page — it's deliberately not in the main navigation, since
this is for you, not visitors). After your emailed security code, the sidebar
provides:

- **Overview** — new leads, unread conversations, open orders, discount
  requests, customer count, collected revenue, and the newest activity.
- **Customers** — searchable customer accounts with order count, lifetime
  value, documents, last activity, and a direct route to their conversation.
- **Sales & orders** — paid and pending orders, subscriptions, recorded
  amounts, manual payment confirmation (for verified off-platform payments),
  and cancellation of unpaid orders.
- **Projects** — paid website work separated by whether the project brief is
  ready, with a direct route to message the customer.
- **Leads** — website quotes and service requests in one searchable pipeline;
  move each through new, contacted, qualified, won, lost, or archived.
- **Inbox** — every customer conversation, with unread counts and real replies.
- **Documents** — upload a private PDF or image to a customer's account and
  notify them automatically by email and in-app notification.
- **Heroes** — approve or decline American Heroes Discount requests.
- **System health** — customer checkout, Stripe mode/webhook readiness, email
  delivery, and private document storage, without exposing any secret values.
- **Account settings** — change your own name, login email, password, and
  notification preferences.

Everything saves immediately and is live on the site the moment you save —
no rebuild, no redeploy.

## Customer accounts (myaccount.html)

Separate from your own staff login, customers can create their own accounts:

1. Anyone can register at `myaccount.html#register` — open to the public.
   New accounts default to role `customer` and have no admin/staff access,
   ever, regardless of how they signed up.
2. They have to verify their email (see step 4 above) before they can sign
   in at all — this is the main anti-bot measure for open registration.
3. **Documents.** To attach an invoice, receipt, or other document to a
   customer, they need to have registered (and verified) first. Go to
   **Documents** in the admin workspace, enter their email, and upload.
   They see it — with a download link for any attached file — at
   `myaccount.html#dashboard`.
4. **Messages.** Customers can message you from `myaccount.html#messages`.
   You'll see it in the **Inbox** in the admin workspace (and get
   an email if you set `ADMIN_NOTIFY_EMAIL`), and can reply from the same
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

`myaccount.html#reset-request` generates a reset token for any account, but automatic email delivery only
works if you completed step 4 above. Without it, find the token yourself:
Netlify dashboard > **Blobs** > `tokens` store (most recent key with
`"type":"password-reset"`), then open
`myaccount.html#reset?token=<that token>`. A customer who can't do this
themselves will need to call or email you.

## Known limitations, honestly

- **Email delivery is required for administrator sign-in.** Customer-facing
  verification and reset emails also depend on it for a usable production
  experience. Set up Resend (step 4) before anyone uses `myaccount.html`.
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
