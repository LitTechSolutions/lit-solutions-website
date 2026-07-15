# Care Hub launch — legal review checklist

**Purpose:** everything that must be true before real customers get
Care Hub accounts, from a legal/privacy standpoint. This is a checklist
of gaps, not a status report of what's built — check items off only
when actually resolved, not when "probably fine."

## Blocking — must resolve before any real customer account is created

- [ ] **Attorney review and approval of `CARE_HUB_PRIVACY_POLICY_DRAFT.md`**
      and `CARE_HUB_TERMS_OF_SERVICE_DRAFT.md`. Neither is legal text
      yet — both are engineering-authored drafts grounded in the real
      data model, explicitly not final wording.
- [ ] **Resolve audit findings F006 and F007** (open Critical) against
      the *existing* `privacy.html` — or explicitly decide to supersede
      it with the Care Hub policy for all users, documented either way.
      Publishing an accurate Care Hub policy while the public site's
      policy remains known-inaccurate is a worse state than today's,
      not a fix.
- [ ] **Fill in Terms of Service §9 (liability/indemnification) and
      §10 (governing law/disputes)** — currently placeholders,
      deliberately not drafted by engineering.
- [ ] **Decide and document the payment/pricing terms** referenced as
      placeholder in ToS §6 — depends on the still-open pricing/deposit
      owner decisions in `OWNER_DECISIONS.md`.
- [ ] **Confirm object-storage provider for uploaded files** — currently
      base64 data URIs in Netlify Blobs, provider "still undecided" per
      `OWNER_DECISIONS.md`. The Privacy Policy should name the actual
      provider before launch, not describe an interim implementation
      detail as permanent.

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
- [ ] Decide whether the Care Hub Privacy Policy/ToS are separate
      documents from the public site's, or get merged into one.
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

- General public-site legal fixes (F006/F007's fix on `privacy.html`
  itself, cookie-banner correctness, etc.) — tracked in
  `docs/audit/`, not duplicated here except where it blocks Care Hub
  launch (see above).
- Any employment, contractor, or business-formation legal matters —
  unrelated to the Care Hub product.
