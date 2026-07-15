# Care Hub legal drafts — read this first

**Update (Session 20 step 8): Dylan directed a merge — the disclosures
these drafts identified as missing (Resend, Neon, the full Care Hub
data model, MFA security practices, a Care Hub accounts section in the
Terms) are now written directly into the real public pages,
`privacy.html` and `terms.html`, closing audit findings F006 and F007
(`docs/audit/AUDIT_STATE.json`).** The documents in this folder remain
as the factual working-notes/source-of-truth this session drafted from,
and as the fuller Care Hub-specific policy text if a standalone Care
Hub policy is ever wanted again — but the live, merged pages are now
the canonical text, not these drafts. See `DECISION_LOG.md` for the
reversal of this session's earlier "keep them separate" call.

**Status: these documents are still DRAFT working notes, not final,
attorney-approved legal text** — and neither, now, is the merged content
in `privacy.html`/`terms.html`. Dylan asked for "full-scale protections"
to be written now as a placeholder rather than left blank, using
standard, well-established boilerplate patterns (not invented novel
terms) — but an attorney has not reviewed any of it. Per this project's
standing rule, no session writes final, binding legal wording on its
own authority; what's live now is Dylan's own explicit call to publish
a strong placeholder pending that review, not this session's
unilateral decision to skip review.

## What's in this folder

| File | Purpose |
|---|---|
| `DATA_FLOW_AND_SUBPROCESSORS.md` | Factual inventory: what personal/business data the Care Hub collects, where it's stored, and every third-party sub-processor that touches it. This is the source of truth the other three documents are built from. |
| `CARE_HUB_PRIVACY_POLICY_DRAFT.md` | Draft privacy policy for the Care Hub (`/care-hub/`), scoped to what it actually does. Does not replace or restate the existing public-site `privacy.html` — see "Relationship to the existing site policy" below. |
| `CARE_HUB_TERMS_OF_SERVICE_DRAFT.md` | Draft terms of service governing Care Hub accounts (separate from any general website-use terms in the existing `terms.html`). |
| `LAUNCH_LEGAL_REVIEW_CHECKLIST.md` | Checklist of everything that must be reviewed, resolved, or attorney-approved before the Care Hub can be exposed to real customers. |

## Why this exists now (Session 20, step 9)

The repository-wide audit (`docs/audit/`) has two **open Critical**
findings that are directly relevant to the Care Hub, not just the public
site:

- **F006** — the existing `privacy.html` says data collection is
  "only what you give us directly" (contact forms, analytics, local
  storage) but omits that the platform also stores accounts, sessions,
  messages, documents, leads, and IP addresses.
- **F007** — Resend, the transactional email sub-processor, is not
  named anywhere in `privacy.html`.

The Care Hub massively expands what's actually collected and stored
(organizations, tickets, checklists, documents, audit logs, MFA
secrets, etc.) via a real Postgres database (Neon) in addition to the
legacy Netlify Blobs stores the public site already used. **Publishing
Care Hub functionality to real customers without first correcting these
disclosures would make F006/F007 materially worse, not just leave them
unresolved.** These drafts are written to close that gap honestly.

## Relationship to the existing site policy (superseded — now merged)

`privacy.html`/`terms.html` are now the merged, canonical policy for
both the public marketing site and the Care Hub. `privacy.html` §1
covers both "from this public website" and "from the Care Hub" data
separately but in one document; §3 names all four real sub-processors
(Netlify, Neon, Resend, Square) in one place. `terms.html` gained a new
§18 "Care Hub Accounts" that explicitly incorporates the existing
Limitation of Liability (§7), Indemnification (§12), and Governing Law
(§14) sections rather than duplicating separate versions of them.

**One real, documented limitation of the merge:** `privacy.html` and
`terms.html` are served through this site's client-side i18n system
(`js/i18n.js`, `i18n/{lang}.json`) — 15 non-English languages have their
own full translations of these two pages' pre-merge content. This
session updated the English source only; it did **not** attempt to
translate the new/changed content into the other 15 languages (legal
translation accuracy is exactly the kind of thing that shouldn't be
invented by an engineering session). Concretely: the edited English
paragraphs (privacy §1/§3/§5/§6, and the entirely new terms §18) will
render correctly in English for everyone, but non-English visitors
viewing privacy.html §1/§3/§5/§6 will see the OLD, pre-merge translated
text, now inconsistent with the English version, until those 15
language files are professionally re-translated. This is a real,
tracked gap — see `LAUNCH_LEGAL_REVIEW_CHECKLIST.md`.

## What was *not* invented

Every data category, table, and sub-processor named in these drafts (and
now in the merged `privacy.html`/`terms.html`) is taken directly from
the current schema (`migrations/001-004`), the current codebase
(`netlify/functions/`, `package.json`), and Dylan's already-resolved
owner decisions (`OWNER_DECISIONS.md`, `DECISION_LOG.md`). Nothing here
describes a feature that doesn't exist yet as if it were live — Square
(beyond the static dev Payment Link, which isn't a real integration),
Cloudinary (decided, owner decision #11, but not yet integrated — files
are still base64-in-Blobs), and the AI assistant (F060) are all
explicitly called out as **planned/decided, not active**. `terms.html`
§18's Care Hub-specific liability/indemnification/governing-law coverage
reuses the site's own existing, already-established §7/§12/§14 language
rather than inventing new clauses from scratch — this was Dylan's
explicit direction (use the existing "full-scale protections" as the
placeholder, not draft new ones).
