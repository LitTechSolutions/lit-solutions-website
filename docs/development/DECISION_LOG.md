# Engineering Decision Log

Decisions Claude made within its own discretion this session (not owner-controlled), with reasoning, so future sessions don't re-litigate them.

## 2026-07-14 — Session 0

**Decision:** Work in a full copy of `v23` placed at `LTS Stand Alone Software` (this workspace), on branch `feature/business-care-hub`, rather than a worktree inside `v23` itself.
**Why:** Dylan's explicit choice when asked, given the originally-assigned working directory was empty and unrelated to the real repository. This copy retains full git history and the `origin` remote (`LitTechSolutions/lit-solutions-website`) since it was copied with `.git` intact, so branching/committing here works normally — but nothing gets pushed without separate explicit permission, since this remote is what deploys production.
**How to apply:** All future Business Care Hub sessions should resume in this workspace, on this branch (or a further branch off it), not in `v23`. `v23` remains the live/production-tracking folder and should not be treated as this project's workspace.

**Decision:** Adopt `AUDIT-F0xx` when referring to audit findings and keep Business Care Hub function IDs as plain `F0xx` in this repo's own docs, always with a "function" vs. "finding" qualifier in prose.
**Why:** The audit's finding-ID scheme (`F001`–`F036`, from `v23/docs/audit/AUDIT_STATE.json`) and the Business Care Hub's function-ID scheme (`F001`–`F060`, from the Master Function Index) collide by coincidence — both start numbering at F001. `AUDIT_STATE.json` itself notes finding IDs have no predetermined catalog size, unlike the Hub's fixed 60.
**How to apply:** Any future doc that needs to reference both in the same sentence should write "audit finding F00X" / "function F0XX" explicitly rather than bare "F0XX", to avoid ambiguity.

**Decision:** Did not read the individual per-function workbooks (they don't exist) and did not re-explore the entire `v23` repository file-by-file — relied on the Global Requirements + Master Function Index roll-ups plus one targeted Explore-agent inventory pass over `netlify/functions/`, auth, data store, and the 9 spec-only folders.
**Why:** Session 0 instructions explicitly discourage rereading all 60 workbooks or the entire repository; the targeted pass covered everything Session 0's required deliverables actually need.
**How to apply:** Later sessions implementing a specific function should still read that function's individual workbook if/when Dylan provides it (see `OWNER_DECISIONS.md` #10), and should read the specific existing-code files relevant to that function rather than re-running a full repository sweep.

**Decision:** Did not attempt to run `npm install`, add any dependency, or run any build/lint/test command beyond `node -v`/`npm -v`, since `package.json` has no `scripts` key and no test/lint/build tooling exists at all.
**Why:** Session 0 explicitly prohibits installing packages; there was nothing to run baseline commands against beyond version checks.
**How to apply:** The first session that needs a test runner (per `TEST_STRATEGY.md`) will be adding the first `devDependency` this repository has ever had — treat that as a deliberate, visible decision point, not a routine `npm install`.

## 2026-07-14 — Standing instruction (given after Session 0)

**Decision:** Keep everything for the entire Business Care Hub build local to this workspace (`LTS Stand Alone Software`, branch `feature/business-care-hub`). No pushing to `origin`, no merging into a new `vN` folder, no merging into `main`, no Netlify deploy preview — for any future session, not just Session 0 — until Dylan explicitly decides to ship.
**Why:** Dylan's direct instruction. Supersedes the "two deploy paths" open question raised in `DEPLOYMENT_PLAN.md` during Session 0 — resolved as "neither, stay local" for now.
**How to apply:** Every future session commits its work to this branch in this workspace and stops there. Don't propose or execute a push/merge/deploy step as part of routine session closure — that requires a separate, explicit, future instruction from Dylan. Updated in `00_DEV_CONTROL.md` ground rules and `DEPLOYMENT_PLAN.md`.

## 2026-07-14 — Session 1

**Decision:** Wrote all Session 1 code (`src/domain/`, `src/policy/rbac.js`, `src/audit/`, `src/settings/`) as plain CommonJS with JSDoc type annotations, not TypeScript compiled via esbuild, and used Node's built-in `node --test` rather than adding a test-runner dependency.
**Why:** `ARCHITECTURE.md` §3.1/§3.8 recommended TypeScript + esbuild and a "lightest-weight test tooling" decision, but that pipeline has the most payoff where client and server code need to share modules (e.g. pricing logic reused between browser and function) — which doesn't apply to Session 1's backend-only domain/policy layer. Introducing a build step now, before there's a concrete client-sharing need, would be exactly the kind of premature infrastructure the master instruction's "avoid overengineering for hypothetical future requirements" principle warns against. `node --test` is zero-added-dependency and already installed (Node 24.18.0).
**How to apply:** Revisit TypeScript/esbuild when Session 2 (Customer Workspace UI) actually needs to share a domain/pricing module between browser and function code — don't retrofit it onto Session 1's code preemptively. If that need never materializes, plain JSDoc-typed CommonJS may simply be the right long-term choice for this codebase, consistent with its existing minimal-dependency bias.

**Decision:** Scoped Session 1 to what's genuinely unblocked: built F005 (RBAC pure policy engine), F008 (audit event shaping + Blobs sink), and F056 (settings/feature-flag document logic + Blobs adapter) as real, tested code; drafted F001/F002 as domain types only (no persistence); left F007/F058 untouched (blocked); and treated F003/F004 as "no gap, reuse existing code" and F006/F059 as "not started, dependency-blocked" rather than building speculative code for any of them.
**Why:** Per the master instruction §8's prescribed process for owner-decision blockers: "record the issue... mark the affected function blocked... continue with independent work where possible." The primary-data-store decision (`OWNER_DECISIONS.md` #1) blocks F001/F005 *persistence* specifically, not the pure decision logic F005 is mostly made of — so building the policy engine now, storage-agnostically, is real forward progress that doesn't prejudge that decision.
**How to apply:** When the primary-data-store decision lands, F001/F002 need real persistence adapters (following the pattern in `blobsAuditSink.js`/`blobsSettingsStore.js` if Blobs is chosen, or a new adapter shape if Postgres is chosen) — the domain types and `rbac.authorize()` itself should not need to change.

**Decision:** Fixed a real gap caught by `test/fixtures/organizations.test.js` during this session: `rbac.authorize()` originally had no concept of membership status, so a suspended `OrganizationMembership` would still pass as long as the caller (wrongly) forwarded its role. Added a `MEMBERSHIP_BACKED_ROLES` check requiring `actorMembershipStatus === "active"` for `org_owner`/`org_member`/`read_only_customer`, failing closed (denied) if omitted or anything else.
**Why:** SYS-AUTH-005 requires suspension to take effect on the next authorization check — leaving that check to caller discipline is exactly the kind of "hidden authorization assumption" the master instruction warns against (§16). Catching this via a test that initially demonstrated the gap, then fixing the production code rather than just documenting the gap as permanent, is the intended use of a test suite.
**How to apply:** Any future caller of `authorize()` for `org_owner`/`org_member`/`read_only_customer` MUST resolve and pass `actorMembershipStatus` from the real membership record once persistence exists — omitting it is a deny, not a silent pass-through, by design.
