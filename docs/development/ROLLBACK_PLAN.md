# Rollback Plan

## Current-state rollback mechanics (pre-existing, unrelated to this session)

The existing `vN`-folder convention *is* the production rollback mechanism today: if a release has a problem, the previous `v(N-1)` folder's HEAD can be pushed again. There is no automated rollback, no feature-flag kill switch, and no documented data-rollback procedure beyond "the previous folder still exists on disk."

## This session's own rollback

- This workspace (`LTS Stand Alone Software`) is a full copy of `v23` with `.git` intact, isolated from `v23` itself. If anything in this session needs to be undone, the entire workspace can be discarded and re-copied from `v23` fresh — `v23` was never modified.
- Within this workspace, everything produced this session lives under `docs/development/` on branch `feature/business-care-hub`. Rolling back this session specifically means: don't merge/push this branch, or `git reset`/delete it — no production or `main`-branch state is affected either way, since nothing was pushed.
- No database, Blobs data, or deployed code was touched — there is nothing to roll back at the data or production level from Session 0.

## Rollback requirements for future sessions (per Deployment & Operations sheet — to be honored, not yet exercised)

- Keep the last-known-good deployment identifiable at all times.
- Every migration needs a documented reversible-migration or compensating-rollback path before it runs (see `MIGRATION_PLAN.md`'s protocol).
- Every feature-flagged module needs a kill switch that doesn't require a redeploy.
- A restore exercise (backup → restore → verify) should be run and evidenced before F059 is considered complete, not just designed.

## Status as of Session 9 (Release Readiness)

Unchanged from Session 0: this workspace holds 9 sessions of commits (`git log` on `feature/business-care-hub`), all local, nothing pushed. Rolling back any individual session means resetting to the prior session's commit on this branch — each session's commit is self-contained and independently revertible, since none of them touch shared mutable state (no database, no deployed code, no `v23`). The rollback requirements listed above for future sessions (feature-flag kill switches, restore exercises) remain unexercised because nothing has been deployed yet — expected at this stage, not a gap in this session's work.
