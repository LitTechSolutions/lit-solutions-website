# Care Hub launch — legal review checklist

**Purpose:** everything that must be true before real customers get
Care Hub accounts, from a legal/privacy standpoint. This is a checklist
of gaps, not a status report of what's built — check items off only
when actually resolved, not when "probably fine."

## Blocking — must resolve before any real customer account is created

- [x] **Resolve audit findings F006 and F007** (Critical) against the
      *existing* `privacy.html` — **DONE, Session 20 step 8.** Dylan
      chose "merge everything" rather than keeping a separate Care Hub
      policy — `privacy.html` §1/§3/§5/§6 now disclose the full Care Hub
      data model, Neon, and Resend directly. Marked `Resolved` in
      `docs/audit/AUDIT_STATE.json`.
- [x] **Fill in Terms of Service liability/indemnification/governing-law
      coverage for the Care Hub** — **DONE, Session 20 step 8**, per
      Dylan's explicit direction to use "full-scale protections... as a
      placeholder." `terms.html` §18 "Care Hub Accounts" incorporates the
      site's existing §7 (Limitation of Liability), §12
      (Indemnification), and §14 (Governing Law) sections rather than
      leaving them blank. Still **not attorney-reviewed** — see below.
- [ ] **Attorney review and approval of the now-live `privacy.html` §1/§3/§5/§6
      and `terms.html` §18.** This is the one item that did NOT get
      resolved by the merge — it made the content real and complete, not
      attorney-approved. Do not treat "merged" as "reviewed."
- [ ] **Translate the merged privacy.html/terms.html content into the
      other 15 languages.** The site's i18n system (`i18n/{lang}.json`)
      has full pre-merge translations of both pages for all 15
      non-English languages; this session updated the English source
      only. Non-English visitors currently see stale, pre-merge text for
      the touched sections (privacy §1/§3/§5/§6; terms §18 renders in
      English for everyone since it's a brand-new section with no
      translation yet). This is a real accuracy gap for non-English
      visitors, not a cosmetic one — the whole point of fixing F006/F007
      was disclosure accuracy.
- [ ] **Decide and document the payment/pricing terms** referenced as
      placeholder in ToS §6 — depends on the still-open pricing/deposit
      owner decisions in `OWNER_DECISIONS.md`.
- [x] **Object-storage provider for uploaded files** — **DECIDED,
      Session 20 step 8: Cloudinary** (`OWNER_DECISIONS.md` #11). Not yet
      integrated (still base64-in-Blobs) — do not describe Cloudinary as
      active in any policy content until the migration code exists.

## Blocking — must resolve before Square goes live

- [ ] Update `DATA_FLOW_AND_SUBPROCESSORS.md` and the Privacy Policy's
      §5 to describe Square as **active**, not planned, once the
      Sandbox/production integration actually exists (step 8 of this
      directive).
- [ ] Confirm Square's own data processing terms are compatible with
      what's promised in the Care Hub Privacy Policy (we don't store
      card data — confirm Square's flow actually guarantees this on
      our end, e.g. hosted fields/tokenization, not raw card pass-through).

## Blocking — must resolve before AI Assistance (F060) is built

- [ ] Before any AI feature ships, update the Privacy Policy to name
      the AI provider, what data it's given, and get consent-version
      re-acceptance if this counts as a material change (it does).
- [ ] Confirm the AI provider's data-use/training policy (does it train
      on customer data? retention period?) before selecting a provider,
      not after.

## Should resolve before launch, not strictly blocking

- [ ] Implement the retention periods listed in
      `DATA_FLOW_AND_SUBPROCESSORS.md` §4 as real automated
      deletion/archival jobs — they're currently approved policy, not
      enforced code. Until they're enforced, the Privacy Policy should
      use softer language ("our policy is to...") rather than stating
      them as guaranteed fact — attorney's call.
- [ ] Decide whether Care Hub accounts get a self-service data
      export/delete request flow, or whether "email us" (current draft
      §7) is acceptable at this scale.
- [x] ~~Decide whether the Care Hub Privacy Policy/ToS are separate
      documents from the public site's, or get merged into one.~~
      **DECIDED, Session 20 step 8: merged.**
- [ ] Legal-hold procedure: what happens to a record scheduled for
      deletion if it's needed for a dispute or investigation — not
      addressed anywhere yet.

## Non-blocking, but verify before launch

- [ ] Confirm invite-only registration (current default) is still the
      intended launch posture, since the drafts assume no self-service
      signup.
- [ ] Confirm MFA-related language in the Privacy Policy (§2, §8) still
      matches reality if MFA is ever extended beyond platform_admin
      accounts to org_owner/org_member roles.
- [ ] Re-check this checklist itself for drift — if a later session adds
      a new sub-processor, data category, or integration, it must be
      added to `DATA_FLOW_AND_SUBPROCESSORS.md` first, then flow into
      the two draft documents, not skip straight to code.

## Explicitly out of scope for this checklist

- General public-site legal fixes not related to the Care Hub
  (cookie-banner correctness, other open audit findings, etc.) —
  tracked in `docs/audit/`, not duplicated here. (F006/F007
  specifically WERE Care Hub-relevant and are now resolved — see above.)
  launch (see above).
- Any employment, contractor, or business-formation legal matters —
  unrelated to the Care Hub product.
