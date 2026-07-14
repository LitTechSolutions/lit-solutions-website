# Full Engineering Changelog (Internal)

Complete, unabridged version history including implementation and security-fix detail that has been simplified or omitted from the public `patch-notes.html` page for tone/disclosure reasons (Owner Decision, finding F024). Nothing here is secret — it's just more detail than a customer needs, or names specific internal mechanisms/attack vectors that are unhelpful to publish. Every public-facing patch note remains factually accurate; this is the fuller record.

## v3.2.2

- Corrected the hull number in founder Dylan's Navy photo caption on the About page -- USS Antietam is CG-54, not CG-64 as it previously read
- Tightened server-side access controls on an internal admin tool so it's restricted to staff accounts only, as originally intended
- Added rate limiting to the signed-in customer messaging feature, matching the limits already in place on every other form on the site
- Added stronger file-type checks on Website Designer photo/logo uploads
- Added an independent server-side check on Website Designer price totals, as a safeguard against a manipulated or corrupted submission being treated as legitimate
- Fixed a light-mode display bug affecting a handful of notice/callout boxes (the launch-special banner, a few info notes, and some status badges), where they could render without their intended background color

## v3.2.1

- Fixed a real bug: Testimonials and Portfolio still said "nothing here yet" even after real content was added. Adding a testimonial or project through the admin panel always worked and always displayed correctly -- but the hero headline on both pages ("We're new..." / "Portfolio -- building it out for real...") was static and kept showing regardless, directly above the real content, which read as contradictory. Both headlines now automatically switch to "What our customers are saying" / "Recent work" the moment real content exists, in all 15 supported languages

## v3.2.0

- Fixed a real bug: the live preview could cover the business name field. On mobile, the live preview was pinned ("sticky") in place while the rest of the page scrolled underneath it — meaning it could visually sit on top of the business name field or other page content, most noticeably if you tried to submit before filling everything in
- Reworked the live preview into the tool's focal point on every screen size, not just mobile. It's no longer pinned/sticky at all — it now sits in a large, prominent panel at the very top of the page, with your business name, running price estimate, discount toggle, and cost breakdown laid out clearly underneath it. Previously on desktop the preview was a narrow sidebar next to the package/feature options; now it's a full-width centerpiece on both desktop and mobile
- Because nothing is pinned in place anymore, the preview can no longer end up in the way while scrolling through Step 2's feature categories — a broader version of the same underlying issue

## v3.1.0

- Website Designer now gets you a quote in seconds, not a long form. Previously, seeing your price and actually submitting meant filling out the full project-details form (business description, services, brand colors, photos, and more) first. Now: pick a package and features, see your exact price clearly, and submit with just your name, email, phone, and preferred contact method — that's it, we get notified right away
- After that quick quote, you're asked whether you'd like to fill out full project details now or leave it for later. Saying "not right now" is a real, complete option — you'll still hear from us. Saying yes shows the same detailed form as before, now clearly optional and separate from getting your price
- Both steps email a notification the moment they're submitted, and if you do continue to the full details, that email references your original quick quote so nothing gets lost or duplicated on our end

## v3.0.0

- A full visual redesign — new colors, type, and layout across the entire site. Same logo, same content, a new look: a cleaner indigo-and-emerald palette, bolder headlines, more breathing room, and softer corners, applied everywhere from the homepage to legal pages to the Website Designer tool, in both light and dark mode
- Fixed a real bug in the mobile menu — opening the Services or Resources dropdown on tablet/narrow-desktop widths (roughly 1100–1620px) rendered it detached and floating away from its label instead of docked underneath, a leftover mismatch between two different breakpoints from an earlier fix
- Fixed the cause of "my portfolio post disappeared" — the admin panel required two separate steps to actually publish a new post (an "Add item" click, then a separate "Save changes" click); missing the second step meant nothing was ever sent to the server, so the public page correctly kept showing "nothing here yet." Every add/edit/delete/reorder now saves immediately, with a clear "Saved" confirmation or an error if it didn't go through
- Redesigned the portfolio, testimonials, gallery, and blog cards around a real image focal point — bigger photos, cleaner text hierarchy underneath — and fixed a real bug found along the way where uploaded blog post photos were never actually displayed
- Rebuilt the Website Designer's mobile layout so the live preview of your site stays pinned as the focal point while you scroll through packages and features underneath, and fixed a genuine mobile bug (a layout overflow once a package was selected) along with several smaller mobile-only issues

## v2.3.0

- The rest of the website now speaks every language it offers, too — the last two releases fixed translation for the Website Designer tool specifically, but 25 other pages (legal terms, privacy policy, payments, the intake form, every individual service page, booking, the team/testimonials/portfolio/gallery pages, all blog posts, the account page, search, sitemap, and the 404 page) had never been translated at all and stayed in English regardless of language. All of it — roughly 800 pieces of text per language — is now translated across all 15 non-English languages
- Every page was checked for balanced HTML and exact translation-key coverage (no missing or mismatched strings) before publishing, and each language's new text was matched to the tone and terminology already established on the pages that were translated previously

## v2.2.2

- The Website Designer tool now actually speaks every language it offers — package contents, feature checkboxes, category names, pricing/discount messages, the live preview, and every form field on Step 3 previously stayed in English no matter which of the 16 languages you picked. All of it is now translated, including the business-brief questions added in the last release
- Fixed a second, unrelated bug found while checking languages: a hidden anti-spam field on the Website Designer form used a left-position trick that only works in left-to-right layouts, which could inflate the page's scrollable width under Arabic (right-to-left) — switched it to the same direction-safe technique already used for the "skip to content" link
- Looked specifically for a reported bug where the language switcher itself disappears in certain languages — tested extensively across languages, screen sizes, and right-to-left layout without reproducing it. If it's still happening, let us know which language and page so it can be pinned down

## v2.2.1

- Fixed the header navigation overflowing on desktop — the "Get a quote" button (and the phone number next to it) could get pushed off-screen to the right on common laptop widths, with the header no longer looking centered against the rest of the page. The header now gives itself more room on wide screens and switches to the compact menu earlier on narrower ones, so nothing overflows
- Checked all 16 languages against this fix specifically, since some translations run noticeably longer than English and were wrapping the navigation into a tall, messy multi-line header — confirmed clean on every language now
- Fixed a second, unrelated bug found while checking languages: viewing the site in Arabic (right-to-left) left a large blank gap on one side of every page. The "skip to content" accessibility link was hiding itself off-screen using a left-position trick that only works in left-to-right layouts; switched it to a direction-safe technique

## v2.2.0

- Website Designer now collects a real content brief, not just scope and price — Step 3 asks what your business does, your industry and service area, your list of services, brand colors/style references, a logo and a few photos, address/hours, social links, and a preferred launch date, plus a spot to name a domain if you don't have one yet
- Checking certain features now reveals the matching content questions right there in the form — team/staff bios, testimonials to feature, FAQ questions, blog topics, pricing to display, booking details, your newsletter platform, and SMS notification specifics — so the submission itself has what's needed to start building
- The emailed submission and the downloadable PDF summary both include this new business brief alongside the existing scope and price breakdown

## v2.1.0

- Added a language selector — look for "ENG" at the very top of every page. Pick your language and the page translates instantly, and the site remembers your choice as you browse. Available so far: Spanish, French, Chinese, Japanese, Vietnamese, Filipino, Arabic, Korean, German, Haitian Creole, Portuguese, Russian, Italian, Polish, and Hindi, alongside English
- Full translation is live now on the Home, About, Services, Pricing, Contact, FAQ, and Website Designer pages — the rest of the site will follow the same way in upcoming updates
- Removed the separate "create a staff account" option from the staff sign-in page — with one owner and no plans to add staff, the existing sign-in is all that's needed going forward

## v2.0.0

- Rebuilt the About Us page — a real look at who we are: our mission and values, an expanded founder story, real photos from Dylan's Navy service, a clear walkthrough of how a website gets built, what support looks like after launch, and a personal note from Dylan. See it on the About Us page
- Starting with this release, version numbers follow major.minor.patch: the first number moves for a major upgrade or feature, the second for smaller feature additions, and the third for bug fixes

## v1.19

- Added the Website Designer — a new interactive tool that lets you pick Starter or Business and watch a live mini preview of your site grow, feature by feature, as you check things off. Try it from the "Website Designer" link in the main menu or from the Pricing page
- The price updates in real time as you go — checking a feature adds its estimated cost immediately, so you always see a running starting total
- Every optional feature is grouped by category (Core Pages, Design & Branding, SEO & Analytics, and more) exactly matching what's in our internal build specs, so what you select is what you actually get quoted
- Bigger capabilities (payments, two-factor auth, e-commerce, and similar) show clearly as "custom quote" items rather than a made-up price — those need a real conversation before we can price them
- If you qualify for the American Heroes Discount, a checkbox right next to the price applies your 15% off one-time work instantly, with the discount broken out as its own line so you can see exactly what you're saving
- Bundle & save: pick every optional feature in a category — either by hand or with the one-click "get all N features" box — and get an automatic extra 10% off that category
- Your exact savings now show right under the price — "You're saving $235" — and the same "Launch special" note already on our Pricing and Heroes Discount pages appears here too: our first 25 customers get introductory rates, but the bundle discount and Heroes Discount are permanent either way
- Feature categories now start collapsed with a quick summary, so you're not staring at every option at once — expand only what you're interested in
- Your live preview now shows a small graphic for each feature (a mini blog post, star ratings, a pricing table, and more), personalized with your business name as soon as you type it
- When you submit, we automatically generate a project summary PDF and email it straight to us — no extra step for you, and no manual copy-paste for us

## v1.18

- Added the Gallery page — a full requirements audit against the master requirements catalog found "Image gallery" was a distinct Mandatory requirement that had been missed (Portfolio covers project write-ups; Gallery is a simple photo grid). Staff can add photos with alt text and an optional caption from a new Gallery tab in the dashboard
- Fixed a validation bug in the admin content editor: required photo fields (like Gallery's) weren't actually being enforced before saving — now they are
- Completed a full pass of every requirement in the master requirements catalog (106 items) against the live site, not just the accounts-related ones

## v1.17

- Added a Dashboard, Favorites, and Notifications to "My Account" — a real hub showing document/favorite counts and recently-viewed pages, a bookmark button on blog posts and portfolio items with a dedicated Favorites & saved-searches view, and an in-app notification center with an unread badge on the nav
- Documents now trigger a notification automatically when staff upload one — customers see it in-app, and get an email too unless they've turned that off
- Added saved searches — signed-in customers can save a search from the Search page and re-run it later from Favorites
- Profile now supports changing your name (no password needed) and setting preferences — language, timezone, and whether to get emailed about new messages/documents
- Staff can send a customer a one-off notification (e.g. "appointment rescheduled") from the Customers tab — separate from a message, for things that don't need a reply

## v1.16

- Added email verification. New accounts (staff or customer) now have to verify their email before they can sign in — the main defense against bot/junk registrations on the open "My Account" sign-up. A "Resend verification email" link appears automatically if someone tries signing in before verifying
- Added two-way messaging. Customers can message us directly from their account (`myaccount.html#messages`) and read our replies; staff see a Customer Inbox in the dashboard with unread counts and can reply from the same place they manage a customer's documents. Separate from the existing Contact page form, which is unchanged
- The "Customer Documents" staff tab is now just Customers — one lookup drives both documents and messages for whoever you pull up
- A customer can only ever read or send in their own message thread — enforced server-side, verified directly over real HTTP with two separate customer accounts

## v1.15

- Added customer accounts. A new "My Account" link (person icon, next to search) in the header lets customers create their own account and sign in — separate from staff sign-in — to view their invoices, receipts, and other paperwork whenever they want, with download links for any attached file
- Added a Customer Documents tab to the staff dashboard: look up a customer by the email they registered with, then upload invoices, receipts, or paperwork (title, type, amount, paid/unpaid status, date, notes, optional PDF/image attachment) for them to see
- Customers can only ever see their own documents — enforced server-side, not just hidden in the interface — and can manage their own login email/password the same way staff can
- This isn't a billing system — payments are still made through the existing Payments page — it's a record locker so paperwork doesn't have to be tracked over email

## v1.14

- Merged Payments and Subscriptions into one page. A single Payments tab with two collapsible sections — One-Time Payment and Subscriptions — replaces the separate Subscriptions page; old links redirect automatically and all 3 Square payment links carried over unchanged
- Added a sign-in-protected admin content editor at a low-key "Staff Sign In" link in the footer — lets the business owner add, edit, delete, and reorder blog posts, portfolio items, and testimonials, with photo uploads, from a real dashboard. Changes go live immediately, no rebuild needed. Every page's existing content and honest placeholders are untouched until something is actually added
- New blog posts get their own page automatically and appear on the Blog list above the 3 original articles; the first portfolio item or testimonial added replaces that page's "still building it out" placeholder
- Added an Account Settings tab so the admin login email and password can be updated directly from the dashboard, without needing the Netlify Blobs dashboard for routine changes
- Backed by Netlify Functions + Netlify Blobs: hashed passwords, secure HttpOnly session cookies, rate-limited sign-in/register/password-reset, and server-side (not just UI-hidden) permission checks on every write

## v1.13

- Business tier compliance pass. Audited the site against the actual Business package requirements spec and closed every Mandatory gap found — every prior page's real content, links, and behavior stayed exactly as it was; this was additive, not a rebuild
- Updated contact email to dylan@lit-solutions.tech and the site's domain to lit-solutions.tech, site-wide
- Added a Privacy Policy page — what's collected, how it's used, cookies/analytics, and your rights (there was previously no privacy page)
- Added an Our Team page, a lighter companion to About, and a Portfolio page with an honest "still building it out" placeholder in the same spirit as the existing Testimonials page
- Added a human-readable Sitemap page and a client-side Search page covering every page on the site, linked from a new search icon in the header
- Added a custom 404 page with a search box and popular links, wired in via `netlify.toml`
- Added breadcrumbs to the 5 service-detail pages and all 3 blog articles, plus in-page quick-jump navigation on the service-detail pages and FAQ
- Added Facebook and Google Business Profile links to the footer, and a Google Maps service-area embed plus a short "send a quick message" form directly on the Contact page (the detailed project form is unchanged)
- Added a site-wide cookie/tracking notice — framed honestly as a transparency notice, since this site doesn't set third-party tracking cookies
- Added Open Graph tags, Twitter card, canonical URLs, and `LocalBusiness` structured data to every page, plus `sitemap.xml`, `robots.txt`, and `netlify.toml` (security headers, 404 redirect) at the site root
- Site now uses Netlify Analytics — cookie-free and enabled from the Netlify dashboard, no client-side script needed

## v1.12

- Upgraded the site to the Business tier feature set. Logo, color theme, fonts, Square payment/subscription links, the American Heroes Discount program, the project intake form, and every existing page's real content and links were kept exactly as they were — this was a structural and feature expansion, not a rebuild from scratch
- Split the homepage into dedicated pages: About (the full veteran-owned story and credentials) and a full Services overview and Contact page now live on their own URLs, with condensed teaser sections linking to each from the homepage
- Added five individual service-detail pages — Website Services, Computer Services, Networking, Cybersecurity, and Small Business IT — each with benefits, full service lists, a process walkthrough, and service-specific FAQs
- Added a Service Area page clarifying that on-site work (computer, network, security) is local to Montross, Colonial Beach, King George, and Dahlgren, Virginia, while website design is available nationwide, fully remote
- Added the same nationwide-website-design messaging to the homepage, Services page, and Contact page
- Added a homepage tagline: "Modernizing the Northern Neck, One Small Business at a Time"
- Added a Testimonials page with an honest "new business" placeholder state instead of fabricated reviews, plus verifiable trust signals in the meantime
- Added an FAQ page covering website packages, service area, pricing, payment, and the Heroes Discount
- Added a Booking page, with a clear notice that online self-scheduling isn't connected yet rather than a fake booking link
- Added a Blog with three initial articles (website redesign signs, password manager basics, Wi-Fi dead zones) and an email signup
- Added dropdown navigation ("Services" and "Resources") to the header so the expanded page set stays organized instead of cluttering a flat menu
- Added a Starter vs. Business package comparison to the Pricing page, showing what's actually included in each website tier side by side
- Extended the design system with new component styles (package cards, testimonial cards, FAQ accordion, blog cards, service-detail layout, newsletter box) built entirely from the site's existing colors, fonts, and patterns — no new visual language introduced

## v1.11

- Fixed a bug where the "Heroes Discount" link was missing entirely from the top navigation on the Subscriptions page
- Fixed a bug where the "Get a quote" button disappeared once you actually reached the intake form (and the Terms & Conditions page had the same gap) — every nav link and the "Get a quote" button now stay visible on every page. When you're already on the page a link points to, it stays visible but becomes non-clickable instead of vanishing or acting like a normal link
- The current page now correctly highlights in orange in the top navigation — this didn't work at all before except for scrolling within the homepage
- Fixed a readability bug where flagged/missing form fields and the "please fill this in" message could become nearly invisible in dark mode (light text on a light background that didn't adapt to the theme)
- Rebuilt the color system for form states: selected checkboxes/radio buttons now use a teal highlight, and errors use a dedicated red — previously both selection and errors used similar orange tones, which was confusing and part of what made the error state hard to read
- Section 5 ("Anything else we should know?") on the intake form is no longer required — it's genuinely optional, as originally intended
- Replaced the free-text "Best time to reach you" field with a clear set of time-range choices (7–9am through 5–7pm, or no preference) so a placeholder answer can't be mistaken for an actual appointment time
- Form guidance now explicitly mentions N/A as an accepted answer alongside "4" for anything that doesn't apply
- Added a notice to the Website Care Plan subscription clarifying it's only available for websites built by Little Technical Solutions LLC, unless full source code is provided or obtainable for a site built elsewhere
- Adjusted logo text line spacing in the header for more consistent alignment with the navigation next to it

## v1.10

- Wired in live Square Subscription links for both recurring plans — Website Care Plan ($39/mo) and Small Business IT Support ($79/mo) are now fully functional on the Subscriptions page
- Fixed a header layout bug where the navigation bar overflowed on medium-width screens (roughly 900–1050px) after the Subscriptions link was added
- Ran a full site-wide debug pass: tested every page across 8 widths from 320px to 1440px and fixed every horizontal overflow found, including a footer navigation bug that had been overflowing on mobile across the whole site, a subscription card sizing issue, and a pricing table that didn't fit on very narrow phones
- Reformatted the "Pay for Service" section on the payment page and the "Proof of eligibility required" note on the American Heroes Discount page — both were dense, hard-to-read paragraphs and are now broken into clearly labeled sections
- Removed an inaccurate claim about no longer sending emailed invoice links, since that was never actually how payments were handled
- Overhauled the project intake form: added a government contracting checkbox to Contact Information; Website Project Details and Government Contracting Info now stay collapsed until their related checkbox is checked (though anyone can still open them manually to look); every field on the form is now required, with typing "4" as an explicit valid answer for anything that doesn't apply; missing fields are called out by name if you try to submit without filling them in

## v1.9

- Expanded the veteran discount into the American Heroes Discount — now covering active duty military, veterans, teachers, first responders, doctors, TSA agents, police, firefighters, and Virginia FFL holders, all at the same discounted rates
- Added an eligibility & verification guide showing exactly what each group needs to provide
- Added this Patch Notes page, linked from the version number in the footer
- Added a Government Contracting Info section to the project intake form (UEI, NAICS codes, SAM.gov info, certifications) for clients who need it, plus new fields for requested domain, existing content to reuse, and photos/imagery
- Switched the intake form's email notifications from a third-party service to native Netlify Forms — submissions now email you directly with no outside service involved, plus basic spam protection
- Added a new Subscriptions page for the Website Care Plan and Small Business IT Support monthly plans
- Fixed a legal compliance issue: removed all requests to photograph or copy federal government ID cards (military ID/CAC, veteran ID card, TSA credentials), which is prohibited under 18 U.S.C. § 701. Verification for those categories now happens in person; documents that aren't restricted (DD-214, LES, employment letters) can still be emailed
- Streamlined the payment pages — removed duplicate per-package payment buttons in favor of a single, clearer payment flow
- Removed the ability to pay directly from the American Heroes Discount page — it's pricing information only now; your discounted total is confirmed after eligibility verification, then paid through the main payment page
- All payments go through the website's payment page, gated behind the required Terms & Conditions checkbox — no emailed invoice links that could bypass that agreement
- Renamed and rewrote the general payment section to "Pay for Service," clarifying it covers any quoted or invoiced amount
- Added a clickable "Do I qualify?" button on the American Heroes Discount page that scrolls to the eligibility list; each category is now clickable and expands to show a short thank-you message plus exactly what's needed to verify that status

## v1.8

- Added a "Launch Special" banner to the pricing, veteran pricing, and payment pages announcing introductory rates for our first 25 customers

## v1.7

- Added the Make a Payment page with Square-powered checkout for deposits and website packages
- Added a Veteran Pricing page with dedicated payment buttons
- Added full Terms & Conditions, including a required agreement checkbox that gates every payment button
- Added site-wide dark/light mode — respects system preference, manual toggle, remembers your choice
- Fixed inconsistent header/navigation alignment across pages
- Ran a full accessibility contrast audit and fixed every text-readability issue found, in both light and dark mode
- Fixed the before/after website slider being too bright in dark mode, and fixed it fighting page-scroll on mobile touch devices
- Full grammar and copy audit across every page

## v1.6

- Website designed and built: homepage with interactive hero, service breakdown, and an interactive drag-to-compare "before/after" website showcase
- Added the veteran-owned founder section with animated service statistics
- Added the Pricing page with a full flat-rate price list and a market-rate comparison table
- Added the client project intake form, connected to email via Formspree
- Real business logo, favicon, and branding integrated site-wide
- Business name, contact info, and service area finalized
