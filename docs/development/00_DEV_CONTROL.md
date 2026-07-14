# Development Control — LTS Business Care Hub

Process and ground rules for every future development session, mirroring the pattern already established by `v23/docs/audit/00_AUDIT_CONTROL.md`.

## How to resume cold

1. Read this file and `DEV_STATE.json` (`nextSession`, `currentWave`, `blockedFunctions`, `ownerDecisionsRequired`).
2. Read `DEV_INDEX.md` for the document map.
3. Read `OWNER_DECISIONS.md` — do not start work on any function listed as blocked there until Dylan has resolved the relevant item.
4. Read only the source files and prior development docs the assigned session's scope actually needs — don't re-explore the whole repository. `ARCHITECTURE.md`, `DATA_MODEL.md`, `AUTHORIZATION_MODEL.md`, and `API_CATALOG.md` already capture the current-state inventory; treat re-deriving it from scratch as a sign something has drifted and needs a targeted re-check, not a full re-audit.
5. Do not spawn subagents unless explicitly instructed.
6. Check `v23/docs/audit/AUDIT_STATE.json` and `AUDIT_INDEX.md` for newly-resolved or newly-opened findings before starting work on a function this file's `auditBlockers` list touches.

## Ground rules (from the master instruction, restated for quick reference)

- Complete only the assigned session/wave. Do not cascade into the next session automatically.
- Application code changes require the relevant owner decisions to be resolved first (see `OWNER_DECISIONS.md`); documentation and pure-domain-type work does not.
- Never work on `main` in this workspace, and **never push, ever, for the entire duration of this build** — Dylan's explicit instruction (2026-07-14) is to keep the whole Business Care Hub build local to this workspace, commits only, no `origin` push, no merge into a new `vN` folder, no merge into `main`, no deploy preview, until he says otherwise. This is not a per-session default that yields to convenience — treat it as standing until Dylan revokes it. See `DEPLOYMENT_PLAN.md` and `DECISION_LOG.md`.
- Never modify `v23` (or any other `vN` folder) from this workspace.
- Preserve working features; remove/replace code only after tests prove behavior and a rollback path exists.
- Domain rules and tests before UI/provider coupling.
- Organization scope and object-level authorization enforced server-side for every customer record and file, from the first function that touches customer data onward.
- Centralize prices, discounts, plan terms, statuses, workflows, service areas, contact details, and feature configuration — do not duplicate them across new code the way the existing Website Designer pricing is duplicated by necessity.
- Never invent business facts, prices, terms, legal conclusions, response times, guarantees, or credentials.
- Treat AI output, uploaded files, external content, provider payloads, and customer HTML/text as untrusted input.
- Update `DEV_STATE.json`, `REQUIREMENTS_TRACEABILITY.md` (created in Session 1), and the relevant `sessions/SESSION_NN_*.md` at the end of every session.
- Stop and request Dylan's approval before changing pricing, discounts, payment policy, plan limits, legal language, retention, public claims, or customer data handling.

## Document map

See `DEV_INDEX.md`.

## Session numbering

Session 0 (this one) = Discovery. Sessions 1–9 follow the wave sequence in `REQUIREMENTS_CATALOG.json`'s `recommendedBuildSequence` and the master instruction's §13 wave descriptions.
