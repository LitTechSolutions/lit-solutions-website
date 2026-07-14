# API Catalog — Current Netlify Functions & Target Standards

## 1. Implemented functions (12)

| Function | Domain | Auth | Notes |
|---|---|---|---|
| `account.js` | User profile/account | Session required | |
| `admin-images.js` | Admin's reusable image library | Admin/staff only (read + write) | Separate from `content.js`'s image usage |
| `auth-login.js` | Sign-in | Public (rate-limited) | Issues `lts_session` cookie |
| `auth-logout.js` | Sign-out | Session required | |
| `auth-password-reset.js` | Password recovery | Public (rate-limited) | Single-use token via `tokens` store |
| `auth-register.js` | Self-registration | Public (rate-limited) | Always creates `role: "customer"`; account-enumeration issue was fixed per audit F015 |
| `auth-verify-email.js` | Email verification gate | Public (token-based) | Blocks sign-in until verified |
| `content.js` | Public CMS content (blog/portfolio/testimonials/gallery) | Public read, admin/staff write | Whole-array replace per slug |
| `documents.js` | Admin-uploaded customer paperwork | Customer (own only), staff (any) | Keyed to `customerId`, not email |
| `favorites.js` | Bookmarks/recently-viewed/saved-searches | Session required, own record only | |
| `messages.js` | Two-way customer↔staff messaging | Session required | Includes staff inbox view; rate-limited (audit F014 fixed) |
| `notifications.js` | One-way in-app alerts | Session required, own only | Exports `createNotification()` for internal reuse |
| `website-designer.js` | Website Designer lead intake + pricing cross-check | Public | Server independently recomputes price as a fraud flag only, never blocks |

Shared library: `netlify/functions/_lib/{auth_utils.js, blob_store.js, email.js, verification.js}`.

## 2. Spec-only functions (9, no code) — see `ARCHITECTURE.md` §2.1 for Care Hub overlap

`booking-scheduler`, `lead-followup`, `leads-dashboard`, `project-scaffold-generator`, `project-status`, `quote-acceptance`, `quote-session` (intentionally client-only, will likely never get a function file), `referral-program`, `website-audit`.

## 3. Target API standards (per API & Integration sheet — not yet implemented)

| ID | Requirement | Current state |
|---|---|---|
| SYS-API-001 | Version/evolve endpoints compatibly | No versioning scheme exists; not yet a problem at 12 functions, will matter once Care Hub adds dozens more |
| SYS-API-002 | Every endpoint declares auth, permission, org scope, request/response schema, rate policy, audit events | Auth is checked but not formally declared/typed; no request/response schema validation library in use; no per-endpoint audit-event emission yet |
| SYS-API-003 | Stable machine error codes + safe human messages + correlation IDs | Functions currently return ad hoc error shapes; no correlation IDs anywhere |
| SYS-API-004 | Idempotency keys for payment/approval/submission/upload/notification/webhook processing | Not implemented; no webhook processing exists yet at all |
| SYS-API-005 | Cursor/stable pagination, never unbounded | Current `list()`-based reads are unbounded/unpaginated (fine at current record volumes, won't be at Care Hub scale) |
| SYS-API-006 | Optimistic concurrency or transactions for conflicting writes | Not implemented; Blobs records have no `version` field today |
| SYS-API-007 | Provider adapters: timeout/retry/backoff/circuit/degraded/sanitized logging | Not implemented for any provider (Blobs, email, Square) |
| SYS-API-008 | Webhook handlers verify provider identity before business success | N/A today — no webhook handlers exist |
| SYS-API-009 | Public form endpoints: spam protection, rate limits, validation, minimization | Rate limiting exists (`ratelimit` store) on login/register/reset/verify/messages; not confirmed on all public intake paths — verify in Session 2/3 |
| SYS-API-010 | API docs with synthetic examples, no credentials | No API documentation exists yet |

This is a from-scratch build for essentially every row above — none of it is currently in place, which is expected for a 12-function MVP-stage backend. Flagged here so later sessions don't assume any of it exists.
