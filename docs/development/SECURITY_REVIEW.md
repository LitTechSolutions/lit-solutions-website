# Security Review — Session 9 (Release Readiness)

This review covers what exists as of Session 9: 27 functions' worth of domain/policy logic (`src/`), zero Netlify Function endpoints, zero UI. Most standard security review activities (penetration testing, auth bypass testing against a live endpoint, dependency scanning against a real deploy) are **not applicable yet** because there is nothing deployed to test — noted explicitly below rather than skipped silently, per the master instruction's "no silent caps" principle.

## What exists and was reviewed

### Authorization (F005 — `src/policy/rbac.js`)
- Default-deny confirmed by test (`rbac.test.js`, 18 cases): unknown role, unknown action, and missing context all deny.
- Two-organization tenant isolation confirmed by test: `org_owner`/`org_member`/`read_only_customer` of Org A cannot act on Org B resources; `platform_admin` correctly bypasses this for platform-scoped actions.
- Membership-status enforcement (SYS-AUTH-005) confirmed: a suspended membership is denied even acting within its own organization; omitting `actorMembershipStatus` entirely fails closed rather than defaulting to allowed. This was a real bug caught by testing during Session 1 and fixed before merge — see `DECISION_LOG.md`.
- Automated-service actions require an explicit per-call grant and cannot cross organization boundaries even with a grant (SYS-AUTH-008 — cannot impersonate a human approver).
- **Not yet reviewable:** whether `rbac.js` is actually *called* on every real request path — it isn't wired to any endpoint yet, so this is a policy-correctness review, not a coverage review.

### Audit trail (F008 — `src/audit/`)
- Event shaping rejects non-primitive metadata values (SYS-SEC-012 — no arbitrary payloads in audit logs), confirmed by test.
- The Blobs-backed sink (`blobsAuditSink.js`) is written but **not integration-tested** — no live Netlify Blobs credentials are available in this environment. Flagged as a required smoke test before this sink is trusted in production.
- **Not yet reviewable:** no function in the codebase actually calls the audit recorder yet, so there's no real audit coverage to verify.

### File upload validation (F015 — `src/policy/fileValidation.js`)
- Size limit, MIME allowlist, and magic-byte verification all confirmed by test, including a deliberate MIME-spoofing case (declares PDF, bytes are actually PNG) that's correctly rejected.
- Defaults (25MB, specific MIME allowlist) are engineering defaults, not an owner-reviewed policy — flagged in `OWNER_DECISIONS.md`/`DEV_STATE.json` throughout.
- **Not yet reviewable:** no malware-scanning/quarantine integration exists; `FileAsset.scanStatus` is modeled but nothing sets it.

### Webhook verification (F057 — `src/webhooks/webhookVerification.js`)
- HMAC signature verification, timestamp/replay-window rejection, tampered-payload rejection, and wrong-secret rejection all confirmed by test. Uses `crypto.timingSafeEqual` (not a naive string comparison) to avoid timing side-channels, with a length-mismatch guard so a malformed signature fails cleanly instead of throwing.
- **Not yet reviewable:** no actual webhook integration exists to verify signatures for.

### Data minimization
- `MetricEvent` (F054) has exactly 3 allowed fields and structurally no payload field — verified by test that extra fields are rejected.
- `ChecklistResponse` (F046/F047) is boolean-only (`met: true/false`) — structurally cannot carry a credential or secret value, verified by test.
- `assertValidSetting` (F056) rejects values that pattern-match common secret-like strings (heuristic, documented as imperfect defense-in-depth, not a hard guarantee).
- `evidenceCategorization.js` (F040/F042) rejects "guaranteed"/"100% secure"/"fully WCAG compliant"/"certified secure" language anywhere evidence text is added — a regex heuristic, same caveat.

### Template rendering (F055)
- Two independent allowlist checks confirmed by test: a template cannot reference an undeclared variable, and a caller cannot supply a variable the template didn't declare. Both are needed — either alone leaves a data-leak path open.

### Export (F053)
- CSV export requires an explicit column allowlist per call — confirmed by test that fields not in the allowlist never appear in output, even if present on the source row object.
- Proper CSV injection-relevant escaping (quotes doubled, fields with commas/quotes/newlines quoted) confirmed by test. **Note:** this does not address CSV formula injection (a field value starting with `=`, `+`, `-`, or `@` being interpreted as a formula by spreadsheet software) — not currently guarded against. Flagged here as a gap to address before F053's export endpoint is built, not fixed speculatively since the actual export UI doesn't exist yet to know what values might reach it.

## Explicitly not applicable at this stage

Per the master instruction's Session 9 checklist, the following require a live deployment, real endpoints, or a chosen provider — none of which exist yet in this workspace (standing instruction: stay local, nothing pushed):

- Penetration/injection testing against a running server
- CSRF/CORS/session-cookie header testing (F003's existing mechanics are reused as-is, unmodified — see `AUTHORIZATION_MODEL.md`; nothing new to test here)
- Rate-limit testing against real traffic
- Dependency vulnerability scan (only `@netlify/blobs` is a dependency; `npm audit` was not run this session since no new dependencies were added — worth running before any deploy)
- Secret-scanning of deployed environment variables (none were touched this session)
- Backup/restore rehearsal (no primary data store has been chosen yet — `OWNER_DECISIONS.md` #1)
- Provider sandbox tests (no provider integrations exist)

## Findings summary

| Severity | Finding | Status |
|---|---|---|
| Fixed | `rbac.js` didn't check membership status, allowing a suspended member's role to pass through if a caller forwarded it | **Fixed in Session 1**, regression test in place |
| Open | CSV export (`csvExport.js`) doesn't guard against formula injection in spreadsheet software | **Open**, to address when F053's real export endpoint is built |
| Open | `blobsAuditSink.js`, `blobsSettingsStore.js` are untested against live Netlify Blobs | **Open**, needs a smoke test once any endpoint uses them |
| Open | Secret-detection heuristics (`settings.js`, `evidenceCategorization.js`) are pattern-match only, not semantic | **Open by design**, documented as defense-in-depth, not a guarantee |
| N/A | Everything else in the master instruction's Session 9 security checklist | **Not applicable** — no live deployment exists |

## Recommendation

Not ready for a production security review in the full sense the master instruction describes — that review needs real endpoints, a chosen data store, and at least one deployed environment to test against. What exists today (the domain/policy layer) has been reviewed to the extent it can be: authorization logic, audit shaping, file validation, webhook verification, template/export data-leak prevention, and data-minimization boundaries all have passing tests exercising their security-relevant behavior. The one bug this process caught (the `rbac.js` membership-status gap) was fixed, not just documented — a sign the test-first approach is doing its job. Re-run this review once F001 persistence and at least one real endpoint exist.
