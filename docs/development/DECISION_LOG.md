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
