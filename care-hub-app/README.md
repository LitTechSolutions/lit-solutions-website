# LTS Business Care Hub -- frontend

React + Vite + TypeScript, scoped entirely to `/care-hub/`. The public
marketing site (`../*.html`, `../css/style.css`, `../js/`) stays static
and build-less, completely untouched by anything in this directory --
see `../docs/development/DECISION_LOG.md`'s Session 20 entries and
`../docs/development/sessions/SESSION_20_RBAC_AND_AUDIT_ENDPOINT.md` for
the full reasoning.

## Develop

```
netlify dev            # from the repo root, in one terminal -- serves the
                        # Netlify Functions backend on :8888
npm run dev             # from care-hub-app/, in another terminal
```

`vite.config.ts` proxies `/.netlify/functions/*` requests from the Vite
dev server to `netlify dev`, so the same relative API paths this app
uses in production work unchanged locally.

## Build

```
npm run build
```

Type-checks (`tsc --noEmit`) then builds with Vite, outputting directly
to `../care-hub` (repo root) -- see `vite.config.ts`'s `build.outDir`.
That directory is gitignored (a generated artifact, not source) and is
what actually gets published at `https://lit-solutions.tech/care-hub/`
once `netlify.toml`'s `build.command` runs this same build during a real
Netlify deploy. `care-hub-app/` itself (this directory) is excluded from
the deploy upload via `../.netlifyignore` -- only the built output is
ever publicly served.

## What exists so far (Session 20, step 4 -- scaffold only)

- `src/api/` -- a fully typed client for every Care Hub HTTP endpoint
  (`client.ts`), a typed error hierarchy distinguishing session-expired/
  forbidden/rate-limited/network failures (`errors.ts`), and the domain
  types those endpoints return (`types.ts`).
- `src/styles/tokens.css` -- the public site's exact design tokens
  (colors, type, spacing), copied by hand since there's no shared build
  step with the build-less marketing site.
- `src/components/states/` -- accessible Loading/EmptyState/ErrorState/
  UnauthorizedState/SessionExpiredState primitives, all built on a
  common `StateScreen`.
- `src/hooks/useApi.ts` -- reduces any API call into one of those states
  automatically (loading -> success/empty/error/unauthorized/expired).
- `src/components/AppShell.tsx` + `src/App.tsx` -- the persistent
  topbar/sidebar frame and router. `Dashboard.tsx` demonstrates the
  full pattern against the real `account.js` endpoint; `/tickets`,
  `/checklists`, and `/account` are honest placeholders (`ComingSoon.tsx`)
  -- not built yet.
- `src/strings/en.ts` -- every user-facing string, one file, so a future
  localization pass doesn't have to hunt through JSX (English only this
  release, per the owner directive).

## What's NOT built yet (steps 5-7 of Dylan's directive)

No authentication UI (login form, MFA enrollment/challenge screens),
no real tickets/checklists screens, and none of the other 22 endpoints
are wired into a screen yet -- only demonstrated by the typed client
existing and `Dashboard.tsx`'s `account.js` call. Each is substantial
enough to be its own session.
