// English-only for this release (owner decision #1: "Do not localize
// the Care Hub into all 16 languages yet. Build it in English with
// localization-ready string organization.") -- every user-facing string
// lives in this one namespaced object, keyed the same way the public
// site's js/i18n.js dictionaries are (dot-path-able sections), so a
// future i18n pass can lift this into a real per-language dictionary
// file without hunting down inline JSX text throughout the app. Do not
// put user-facing copy directly in a component -- add it here and
// import it instead.
export const strings = {
  app: {
    name: "Care Hub",
    brand: "Little Technical Solutions",
  },
  nav: {
    dashboard: "Dashboard",
    tickets: "Tickets",
    checklists: "Readiness Checklists",
    account: "Account",
    signOut: "Sign out",
  },
  states: {
    loading: "Loading…",
    emptyTitle: "Nothing here yet",
    emptyBody: "There's nothing to show for this view right now.",
    errorTitle: "Something went wrong",
    errorBody: "We couldn't complete that request. Try again, and contact us if it keeps happening.",
    retry: "Try again",
    unauthorizedTitle: "You don't have access to this",
    unauthorizedBody: "Your account doesn't have permission to view this page. If you think this is a mistake, contact us.",
    sessionExpiredTitle: "Your session has expired",
    sessionExpiredBody: "For your security, you've been signed out. Please sign in again to continue.",
    signInAgain: "Sign in again",
    notFoundTitle: "Page not found",
    notFoundBody: "That page doesn't exist, or you may not have access to it.",
  },
  auth: {
    loginTitle: "Sign in",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    mfaCodeTitle: "Enter your authenticator code",
    mfaCodeLabel: "6-digit code",
    mfaRecoveryLabel: "Or use a recovery code",
    mfaEnrollTitle: "Set up two-factor authentication",
    mfaEnrollBody: "Administrator accounts require an authenticator app. Scan the code below, then enter a 6-digit code to confirm.",
    mfaRecoveryCodesTitle: "Save your recovery codes",
    mfaRecoveryCodesBody: "Store these somewhere safe. Each code works once, and they will not be shown again.",
  },
} as const;

export type Strings = typeof strings;
