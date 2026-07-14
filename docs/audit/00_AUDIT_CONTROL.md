# LTS Platform Audit — Controller

## Purpose

A repository and production audit of lit-solutions.tech, run as a series of
small, scoped sessions instead of one unbounded pass — so context stays
controlled, findings stay evidence-backed, and no session has to reread the
whole repository to pick up where the last one left off.

Goal: turn an already ambitious one-person platform into a focused,
credible, secure, and maintainable business website — not to chase feature
quantity, and not to rewrite what already works.

## Ground rules (standing, for every session)

- **Model/effort:** Sonnet 5, Medium effort, unless Dylan explicitly says
  otherwise. Do not self-escalate effort or model.
- **No subagents unless Dylan explicitly asks.** Read only what a session
  actually needs (this control doc, the state file, the index, the prior
  session's doc, and the specific source files that session covers) —
  don't re-explore the whole repository.
- **Audit sessions don't implement.** Findings and evidence only. Code
  changes happen in separate, explicitly-requested implementation turns,
  after Dylan has reviewed the backlog and made any owner decisions it
  depends on.
- **Every finding needs evidence** — an exact file, route, or component,
  not a general impression. Prefer "file:line" citations.
- **Findings live in `docs/audit/`.** Chat responses stay concise; the
  written record is the source of truth.
- **Don't disclose exploitable specifics in anything customer-facing.**
  Security findings describe the defect and its impact, not a working
  attack recipe, and never leak into public site content.

## Session outline

| # | Doc | Scope |
|---|-----|-------|
| 1 | `01_REPOSITORY_BASELINE.md` | Architecture, functions, storage, dependencies, versioning, business-data duplication |
| 2 | `02_PUBLIC_SITE_AUDIT.md` | Homepage, nav, footer, all public pages, CTAs, content accuracy |
| 3 | `03_IDENTITY_DATA_SECURITY.md` | Auth, authorization, sessions, customer data, privacy |
| 4 | `04_BACKEND_INTEGRATIONS.md` | Every Netlify Function, forms, files, email/PDF, provider integrations |
| 5 | `05_PRICING_AND_BUSINESS_RULES.md` | Website Designer, pricing/discount logic, plans, payments |
| 6 | `06_QUALITY_AUDIT.md` | Accessibility, mobile, performance, SEO, translation, error/quality states |
| 7 | `07_REQUIREMENTS_GAP_MATRIX.md` | Classify planned/possible functions against what exists, real value, and risk |
| 8 | `08_FINAL_AUDIT_AND_ROADMAP.md` | Consolidated findings, prioritized roadmap, Extra Intelligence handoff |

Session 1 (this bootstrap) was produced from an already-completed full-repo
audit earlier in this project's history (an 8-parallel-pass review whose
findings are carried into `01_REPOSITORY_BASELINE.md` with stable IDs) —
not re-derived from scratch, per the no-redundant-rereading rule above.

## Finding ID and severity convention

- IDs are sequential: `F001`, `F002`, ... assigned in the order a session
  first records them. **IDs are derived from what's actually in the
  repository** — there is no predetermined catalog size (e.g., no fixed
  "F001–F060" requirements list exists yet; that only gets built out in
  Session 7 as an explicit gap-analysis deliverable, and only as large as
  real candidate functions warrant).
- Once assigned, an ID is permanent — a resolved finding keeps its number
  and gets marked `Resolved` with a commit reference, rather than being
  renumbered or deleted.
- Severity: `Critical` · `High` · `Medium` · `Low` · `Owner-Decision` ·
  `Info`. `Owner-Decision` is for anything that is a business/legal/brand
  call, not an engineering one — those are never silently implemented.
- Status: `Open` · `Resolved` · `Deferred` · `Accepted-Risk`.

## State tracking

`docs/audit/AUDIT_STATE.json` holds machine-readable state: which sessions
are complete, per-finding status, and a `readyForSession` pointer. Update it
at the end of every session. `docs/audit/AUDIT_INDEX.md` is the human-
readable index — update its table whenever a new doc is added.
