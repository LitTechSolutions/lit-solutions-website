# v2.3.0 — The Rest of the Site Speaks Every Language Now — What Changed

You asked me to check the other 26 pages for translation gaps and publish
the fix myself once it was done. Here's what that turned into.

## What was actually untranslated

The last two releases (v2.2.1, v2.2.2) fixed language issues on pages that
were already part of the original translation rollout, plus the Website
Designer tool specifically. But 25 pages had never been touched by that
rollout at all, and stayed in English regardless of which of the 16
languages a visitor selected:

`terms.html`, `privacy.html`, `payment.html`, `intake.html`,
`heroes-pricing.html`, `booking.html`, every individual service page
(website, computer, networking, cybersecurity, business IT, service area),
`team.html`, `testimonials.html`, `portfolio.html`, `gallery.html`,
`blog.html` and every blog post (including the three long-form articles),
`404.html`, `search.html`, `myaccount.html`, and `sitemap.html`.

(The one page originally requested but intentionally left alone was
`portfolio.html`'s content itself — per your instruction to hold off on
adding Armour Wireless material until Bill sends more information. This
release only added translation markup to portfolio.html's existing text;
no new content was added to it.)

## The fix

- Added `data-i18n` / `data-i18n-html` / `data-i18n-attr-*` markup to
  every translatable string across all 25 pages — 788 distinct keys in
  total, covering hero text, body copy, form labels and placeholders,
  legal text, blog article bodies, and account-page UI strings.
- Translated all 788 keys into all 15 non-English languages (Spanish,
  French, Chinese, Japanese, Vietnamese, Filipino, Arabic, Korean, German,
  Haitian Creole, Portuguese, Russian, Italian, Polish, Hindi) — nearly
  12,000 translated strings in total.
- Each language's translation was matched against that language's
  existing dictionary (the pages already covered by the original
  rollout) to keep terminology, formality register, and phrasing
  consistent site-wide, rather than reading as a bolt-on addition.
- Inline HTML inside translated strings (links, icons, form attributes,
  entities) was preserved exactly — only the human-readable text was
  translated, so markup and functionality are unaffected.

## One more gap found and fixed while testing

Live-testing the account page (`myaccount.html`) in German turned up a
smaller version of the same problem v2.2.2 fixed for the Website
Designer: the page's heading and browser-tab title ("Sign in," "Create
an account," "Dashboard," etc.) are set by JavaScript as the visitor
moves between sign-in, register, dashboard, documents, and so on, and
those hardcoded English strings had never been wired into translation at
all. Fixed the same way — routed through the `window.LTS_I18N.t()`
bridge, with five new translation keys added and translated into all 15
languages for headings that don't already share exact wording elsewhere
on the page.

## Verification performed

- HTML tag-balance check on all 25 edited pages: clean.
- Cross-checked every `data-i18n*` key actually present in each page's
  HTML against the extracted source-string list: exact match, no
  mismatches, across all 788 keys on all 25 pages.
- JSON validity and exact key-set match (0 missing, 0 extra) verified
  programmatically for all 15 updated `i18n/*.json` files before merging.
- Confirmed `portfolio.html` contains no Armour Wireless content, per your
  standing instruction to hold that separately.
- Not verified: a full manual read-through of all ~12,000 translated
  strings for nuance/idiom in every language (translation was produced in
  bulk against each language's established terminology and spot-checked
  structurally); a live screen-reader pass.
