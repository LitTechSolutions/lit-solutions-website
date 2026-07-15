# Care Hub post-Claude audit evidence — 2026-07-15

## Baseline

- Branch: `feature/business-care-hub`
- Reviewed commit: `b2772e9`
- Tracked worktree at audit start: clean
- Untracked `AGENTS.md` was present and was not treated as product code.

## Automated checks

| Check | Result |
|---|---|
| Root `npm test` | Pass — 791 tests, 0 failures |
| Root `npm audit --omit=dev` | Pass — 0 vulnerabilities |
| `care-hub-app npm run build` | Pass — TypeScript clean; Vite built 62 modules |
| Care Hub `npm audit --omit=dev` | Pass — 0 production vulnerabilities |
| Care Hub full `npm audit` | Fail — 1 High + 1 Moderate development-tool vulnerability through Vite/esbuild |

The frontend package still has no unit, component, contract, browser/e2e, or
automated accessibility test command.

## Parallel approval diagnostic

The real `applyApprovalDecision()` function was invoked twice concurrently
with an injected SQL adapter that held both `SELECT` calls until each had read
the same pending approval. One request approved and the other rejected.

Observed result:

```json
{
  "returnedStatuses": ["approved", "rejected"],
  "selectCount": 2,
  "updateCount": 2,
  "updateHasPendingGuard": [false, false]
}
```

No production database was read or written. This proves the code path permits
two successful decisions; it is not a timing claim inferred from source alone.

## Parallel MFA confirmation-token diagnostic

The real `mfa-enroll.js` handler was invoked twice concurrently with injected
Blobs/session adapters. Both requests read the same unused token before either
write completed.

Observed result:

```json
{
  "statusCodes": [200, 200],
  "tokenReads": 2,
  "tokenWrites": 2,
  "userWrites": 2,
  "sessionsIssued": 2
}
```

No production token, user, session, or provider was used. This proves the
current read/check/write sequence does not enforce single use under
concurrency.

## Legal localization check

The English HTML contains the new Care Hub collection and sub-processor text.
The Spanish dictionary was sampled as a representative non-English locale:

- `privacy.section1_intro` still says only directly supplied information is
  collected;
- `privacy.section3_body` names Netlify and Square but not Neon or Resend;
- the new Care Hub keys such as `privacy.section1_carehub_intro` are absent;
- the new `terms.section18_*` keys are absent.

The same new keys were not found in the other non-English dictionaries by the
repository-wide key search. Missing keys fall back to the English HTML while
old keys overwrite the updated English paragraphs, producing a mixed-language
and incomplete legal page.

## Actions deliberately not performed

- No Netlify deployment or environment-variable read.
- No credential value was printed or inspected.
- No credential was rotated; rotation has user/session impact and belongs to
  the remediation turn.
- No Square transaction, Cloudinary write, email send, or production-data
  mutation.

## Remediation evidence (same-day follow-up)

The audit moved into an explicitly authorized implementation pass after this
baseline evidence was captured. Current worktree verification:

| Check | Result |
|---|---|
| Root `npm test` | Pass — 809 tests, 0 failures |
| Care Hub `npm test` | Pass — 6 component/auth/role tests, 0 failures |
| Care Hub `npm run build` | Pass — TypeScript clean; Vite 8 production build |
| Root `npm audit --omit=dev` | Pass — 0 vulnerabilities |
| Care Hub full `npm audit` | Pass — 0 vulnerabilities |
| Approval parallel regression | Pass — exactly one conditional decision can win |
| MFA email-token parallel regression | Pass — exactly one session issued |
| MFA TOTP parallel regression | Pass — exactly one session issued per counter |
| MFA recovery-code parallel regression | Pass — exactly one session issued per code |
| MFA email landing component | Pass — opening/rendering makes zero activation API calls; explicit button performs the call |

The legal-page engine now excludes an explicitly English-only legal container
from dictionary replacement, and both Privacy/Terms display a language notice.
This resolves the mixed-language/stale-disclosure failure mode without
representing unreviewed machine translations as binding text.

`LTS_SESSION_SECRET` was replaced locally and set to a new write-only value in
Netlify's production, deploy-preview, and branch-deploy contexts. Netlify
reported that a redeploy is required before deployed functions use it; no
deploy was performed. The account-level `NETLIFY_BLOBS_TOKEN` remains an
operational rotation item because revoking a personal token without confirming
its other consumers could affect systems outside this project's scope.
