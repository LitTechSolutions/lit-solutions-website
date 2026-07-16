import { useCallback, useState } from "react";
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
          ) : null}
        </div>
      );
  }
}
