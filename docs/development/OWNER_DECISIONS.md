# Owner Decisions Required

Consolidated from `v23/docs/audit/AUDIT_STATE.json` (11 owner-decision findings), the Master Function Index's 8-item "Stop-and-Approve Owner Decisions" list, and one new engineering finding from this session. Nothing in this file has been decided — each item blocks the specific function(s) noted until Dylan resolves it.

## 1. Primary data store (new — this session)

- **Issue:** Netlify Blobs (current store) has no secondary indexes and does relational-shaped queries via full `list()` scan. Business Care Hub's org/ticket/scope/approval/payment/plan relationships are meaningfully more relational than anything the site does today.
- **Options:** (a) stay on Blobs with hand-rolled composite-key pseudo-indexing, no new provider/cost; (b) introduce managed PostgreSQL for relational entities, keep Blobs for content/sessions/files.
- **Consequence of not deciding:** F001 (Organization Provisioning) and F005 (RBAC) — the two functions everything else depends on — can't finalize their storage design.
- **Recommendation:** (b), evaluated properly per `SYS-ARC-003`'s migration protocol before any production data is involved — but this is a new paid provider, so it's owner-controlled regardless of engineering preference.
- **Blocks:** Wave 1 architecture finalization (F001, F005, and by extension everything downstream).

## 2. Pricing, discounts, deposits, payment timing (audit F030, F031; Master Index item 1)

- Heroes Discount document-verification method (audit F030, Medium, owner decision).
- Full-payment-upfront vs. deposit/milestone policy (audit F031, Medium, owner decision).
- **Blocks:** F026 (Scope/Estimate Generation), F027 (Change Order Approval), F028 (Payment Request/Reconciliation), F050 (Pricing/Discount Engine).

## 3. Plan limits and included work (audit F032; Master Index item 2)

- Subscription plan scope: included edits, hours, carryover, overages, emergency handling — undefined today for both Website Care Plan and Small Business IT plan.
- **Blocks:** F049 (Plan Entitlement/Usage Tracking), F021 (Priority/Impact/Urgency — entitlement affects priority calculation), F052 (Subscription/Billing Plan Management).

## 4. Customer account registration model (audit F033; Master Index item 3)

- Open registration vs. invite-only customer portal — undefined.
- **Blocks:** F002 (Customer Invitation & Account Activation) needs this decided before its flow can be finalized (invite-only changes the entire activation UX vs. open self-registration).

## 5. Data retention, deletion, backup-aging, legal holds (Master Index item 4)

- No periods or policies defined yet.
- **Blocks:** F058 (Data Retention/Export/Deletion), F059 (Platform Backup/Recovery), and is a precondition for F007 (Terms/Privacy/Consent) being accurate.

## 6. Legal/privacy/consent/security-claim wording (Master Index item 5) — **two are already open Critical audit findings, not just future work**

- **Audit F006 (Critical, open):** Privacy Policy under-discloses actual data collection.
- **Audit F007 (Critical, open):** Resend not named as a sub-processor in the Privacy Policy.
- Per the master instruction ("Do not implement architecture that conflicts with unresolved... privacy... findings"), these should be resolved or explicitly acknowledged-and-scoped-around before F007 (Terms/Privacy/Consent) and F058 (Retention/Export/Deletion) are built, since both functions' correctness depends on accurate privacy disclosure.
- **Blocks:** F007, F058.

## 7. New paid providers / infrastructure generally (Master Index item 6)

- Database (see #1), storage, email, monitoring, PDF, analytics, AI, SMS, e-signature — none formally approved yet.
- **Blocks:** Any function whose design assumes a specific provider (F035/F036/F040 monitoring, F053 reporting, F057 integrations, F060 AI).

## 8. Remote support tooling / device agents / automated website changes (Master Index item 7)

- Not yet decided whether these will ever be added.
- **Blocks:** Scope boundary for F044 (IT Support), F046/F047 (Security Readiness/MFA Checklist) — these should explicitly NOT imply remote-access or credential-storage capability until this is resolved (also a hard product-definition boundary per the master instruction: "not... A remote-monitoring agent... A password manager").

## 9. AI provider, data policy, budget (Master Index item 8)

- Not yet decided.
- **Blocks:** F060 (Wave 5, last anyway) and F020's "optional AI assistance" clause.

## 10. Missing individual function workbooks (new — this session)

- **Issue:** The Master Function Index references 60 individual workbooks (`F001_....xlsx` … `F060_....xlsx`) by filename. None were attached and none exist anywhere on disk in this repository or the `Requirements`/`Functions` folders searched during this session (only the two roll-up workbooks — Global Requirements, Master Function Index — were provided).
- **Options:** (a) Dylan provides the 60 individual workbooks before Session 1 begins; (b) Dylan confirms the Global Requirements + Master Function Index summaries (objective, dependencies, priority, complexity per function — already captured in `REQUIREMENTS_CATALOG.json`) are sufficient to proceed without them, at least for early Wave 1 functions.
- **Blocks:** Detailed acceptance-test and business-rule design for any function beyond what the two roll-up workbooks already specify. Does not block Session 0 itself.
