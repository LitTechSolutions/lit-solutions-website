import { useCallback } from "react";
import { api } from "../api/client";
import { Loading } from "../components/states/Loading";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";
import { SQUARE_DEV_PAYMENT_LINK_URL } from "../config/payments";
import { isStaffRole } from "../auth/roles";

/**
 * Placeholder landing route -- demonstrates the full loading/empty/
 * error/unauthorized/expired state cycle against a real endpoint
 * (account.js, the one pre-existing endpoint every signed-in role can
 * call) so the pattern is proven out before step 5 wires real
 * authentication and step 6 builds the ticket/checklist screens on top
 * of it. Every future data-driven route should follow this same
 * useApi() + state-switch shape.
 */
export function Dashboard() {
  const fetchAccount = useCallback(() => api.account.get(), []);
  const state = useApi(fetchAccount, []);
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);

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
            <div className="card">
              <h2 style={{ fontSize: "1rem" }}>{strings.payments.cardTitle}</h2>
              <p style={{ color: "var(--ink-soft)" }}>{strings.payments.cardBody}</p>
              <a
                className="btn btn-primary btn-small"
                href={SQUARE_DEV_PAYMENT_LINK_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: "var(--space-3)" }}
              >
                {strings.payments.payButton}
              </a>
            </div>
          ) : null}
        </div>
      );
  }
}
