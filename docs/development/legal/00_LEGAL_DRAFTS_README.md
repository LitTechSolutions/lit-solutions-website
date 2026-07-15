# Care Hub legal drafts — read this first

**Status: DRAFT. None of the documents in this folder are final,
attorney-approved legal text.** They exist so that Dylan (and, later, an
actual attorney) have an accurate starting point grounded in what the
Care Hub *really does* today, rather than boilerplate that invents
practices or omits real ones. Per this project's standing rule, no
session may write final, binding legal wording — only drafts explicitly
marked as such.

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

## Relationship to the existing site policy

`privacy.html`/`terms.html` are the public marketing site's policies and
are out of scope for this session to rewrite (that's F006/F007's fix,
tracked in the audit, not here). The Care Hub drafts in this folder are
scoped narrowly to the authenticated portal (`/care-hub/` and its
backing Netlify Functions) and are written to be **consistent with, and
additive to** the existing site's disclosures — same named processors
(Netlify, Square) plus what the existing page is missing (Resend, Neon,
the full data model). Whoever finalizes these should decide whether to
merge them into a single site-wide policy or keep the Care Hub as a
policy of its own; that's a product/legal call, not an engineering one.

## What was *not* invented

Every data category, table, and sub-processor named in these drafts is
taken directly from the current schema (`migrations/001-004`), the
current codebase (`netlify/functions/`, `package.json`), and Dylan's
already-resolved owner decisions (`OWNER_DECISIONS.md`,
`DECISION_LOG.md`). Nothing here describes a feature that doesn't exist
yet as if it were live — Square and the AI assistant (F060) are
explicitly called out as **planned, not active**, since neither has a
real integration built.
