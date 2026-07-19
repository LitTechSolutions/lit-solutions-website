import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ActivityEvent } from "../api/types";
import { Loading } from "../components/states/Loading";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";
import { SQUARE_DEV_PAYMENT_LINK_URL } from "../config/payments";
import { isStaffRole } from "../auth/roles";

const SHORTCUTS = [
  { to: "/tickets", title: strings.nav.tickets, body: strings.overview.ticketsShortcutBody },
  { to: "/checklists", title: strings.nav.checklists, body: strings.overview.checklistsShortcutBody },
  { to: "/approvals", title: strings.nav.approvals, body: strings.overview.approvalsShortcutBody },
  { to: "/project", title: strings.nav.project, body: strings.overview.projectShortcutBody },
  { to: "/your-website", title: strings.nav.yourWebsite, body: strings.overview.yourWebsiteShortcutBody },
  { to: "/billing", title: strings.nav.billing, body: strings.overview.billingShortcutBody },
];

function ShortcutGrid() {
  return (
    <div>
      <h2 style={{ fontSize: "1rem" }}>{strings.overview.shortcutsHeading}</h2>
      <div className="hub-grid" style={{ marginTop: "var(--space-3)" }}>
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="hub-tile">
            <span className="hub-tile__title">{s.title}</span>
            <span className="hub-tile__desc">{s.body}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// A bonus widget, not primary page content -- stays quiet (renders
// nothing) on anything other than a clean success/empty result rather
// than surfacing a second error/expired/unauthorized state on top of
// whatever the main account fetch above it already handled. Reuses the
// exact membership-then-timeline-by-org fetch ActivityTimeline.tsx's
// customer branch uses, just showing the 3 most recent events instead
// of the full history.
function RecentActivityCard() {
  const membershipsState = useMemberships();
  if (membershipsState.status !== "success") return null;
  return <RecentActivityForOrg organizationId={membershipsState.data.memberships[0].organizationId} />;
}

function RecentActivityForOrg({ organizationId }: { organizationId: string }) {
  const fetchTimeline = useCallback(() => api.activityTimeline.list(organizationId), [organizationId]);
  const state = useApi(fetchTimeline, [organizationId], (data) => data.timeline.length === 0);

  if (state.status !== "success" && state.status !== "empty") return null;

  const events: ActivityEvent[] =
    state.status === "success"
      ? [...state.data.timeline]
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
          .slice(0, 3)
      : [];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)" }}>
        <h2 style={{ fontSize: "1rem" }}>{strings.overview.activityHeading}</h2>
        <Link to="/activity-timeline" style={{ fontSize: "0.85rem", color: "var(--accent-orange-text)", fontWeight: 600 }}>
          {strings.overview.activitySeeAll}
        </Link>
      </div>
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.overview.activityEmptyBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {events.map((event) => (
            <li key={event.id}>
              <p>{event.summary}</p>
              <p style={{ marginTop: "var(--space-1)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                {new Date(event.occurredAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Landing route. Staff/admin get the original, unchanged welcome-only
 * view -- their sidebar is already a flat, exhaustive tool list, so a
 * "home base" hub adds nothing they don't already have one click away.
 * Customers get a real Overview: welcome, a shortcut grid into the
 * simplified customer nav's destinations (Tickets/Checklists/Approvals
 * plus the Project/Your Website/Billing hub pages), a recent-activity
 * snapshot, and the existing payment card -- so the customer sidebar can
 * stay short (see AppShell.tsx's CUSTOMER_ITEMS) without losing "where
 * do I go for X" clarity.
 */
export function Dashboard() {
  const fetchAccount = useCallback(() => api.account.get(), []);
  const state = useApi(fetchAccount, []);
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  // F011 -- the same Square Payment Link (square.link/u/2oozkfhz) is gated
  // behind an explicit terms checkbox on payment.html; this button used to
  // skip that gate entirely, letting a customer pay before ever seeing the
  // terms. Mirrors payment.html's agreeTerms/pay-btn lock pattern exactly
  // (same legal copy) rather than inventing new wording.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsWarning, setShowTermsWarning] = useState(false);

  switch (state.status) {
    case "loading":
      return <Loading />;
    case "expired":
      return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
    case "unauthorized":
      return <UnauthorizedState />;
    case "error":
      return <ErrorState body={state.message} onRetry={state.retry} />;
    case "empty":
      return <EmptyState />;
    case "success":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <div className="card">
            <h1>Welcome, {state.data.user.name}</h1>
            <p>Signed in as {state.data.user.email}.</p>
          </div>
          {!isStaff ? (
            <>
              <ShortcutGrid />
              <RecentActivityCard />
              <div className="card">
                <h2 style={{ fontSize: "1rem" }}>{strings.payments.cardTitle}</h2>
                <p style={{ color: "var(--ink-soft)" }}>{strings.payments.cardBody}</p>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => {
                      setAgreedToTerms(e.target.checked);
                      if (e.target.checked) setShowTermsWarning(false);
                    }}
                  />
                  <span style={{ fontSize: "0.85rem" }}>
                    I have read and agree to the{" "}
                    <a href="/terms.html" target="_blank" rel="noopener">
                      Terms &amp; Conditions
                    </a>{" "}
                    and{" "}
                    <a href="/privacy.html" target="_blank" rel="noopener">
                      Privacy Policy
                    </a>
                    , including the payment, refund, and dispute policies. {strings.payments.termsAgreeLabel}
                  </span>
                </label>
                {showTermsWarning ? (
                  <p role="alert" style={{ color: "var(--error-text, #A32E2E)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
                    {strings.payments.termsWarning}
                  </p>
                ) : null}
                <a
                  className="btn btn-primary btn-small"
                  href={agreedToTerms ? SQUARE_DEV_PAYMENT_LINK_URL : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!agreedToTerms}
                  style={{
                    display: "inline-block",
                    marginTop: "var(--space-3)",
                    opacity: agreedToTerms ? 1 : 0.5,
                    cursor: agreedToTerms ? "pointer" : "not-allowed",
                  }}
                  onClick={(e) => {
                    if (!agreedToTerms) {
                      e.preventDefault();
                      setShowTermsWarning(true);
                    }
                  }}
                >
                  {strings.payments.payButton}
                </a>
              </div>
            </>
          ) : null}
        </div>
      );
  }
}
