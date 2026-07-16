import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { strings } from "../strings/en";

type LoadState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "loaded"; email: string; role: string; organizationName: string };

/**
 * Pre-auth route a brand-new customer lands on from their invitation
 * email (see invitations.js's sendInvitationEmail -- previously wired to
 * a myaccount.html hash route that was never built; that link has never
 * actually worked). Peeks the token to show who invited them before
 * asking for a name/password, then accepts it. invitation-accept.js
 * deliberately does not issue a session on success (the invite link
 * itself proves email ownership, but creating the account and starting
 * a session are kept as separate side effects) -- so this ends by
 * sending the new customer to /login, not signing them in directly.
 */
export function InvitationAccept() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadState({ status: "invalid" });
      return;
    }
    let cancelled = false;
    api.invitations
      .peek(token)
      .then((result) => {
        if (cancelled) return;
        setLoadState({ status: "loaded", email: result.email, role: result.role, organizationName: result.organizationName });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!termsAccepted) {
      setError(strings.invite.termsRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.invitations.accept({ token, name, password, termsAccepted, marketingConsent });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.invite.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState.status === "loading") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <p>{strings.invite.loading}</p>
        </div>
      </div>
    );
  }

  if (loadState.status === "invalid") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1>{strings.invite.invalidTitle}</h1>
          <p>{strings.invite.invalidBody}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1>{strings.invite.doneTitle}</h1>
          <p>{strings.invite.doneBody}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate("/login")}>
            {strings.invite.goToSignIn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <p className="auth-card__brand">
          {strings.app.brand} <strong>{strings.app.name}</strong>
        </p>
        <h1 className="visually-hidden">{strings.invite.introPrefix}</h1>
        <p>
          {strings.invite.introPrefix} <strong>{loadState.organizationName}</strong> {strings.invite.introSuffix} <strong>{loadState.role}</strong> (
          {loadState.email}).
        </p>
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="invite-name">{strings.invite.nameLabel}</label>
            <input id="invite-name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="invite-password">{strings.invite.passwordLabel}</label>
            <input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            <span>
              I have read and agree to the{" "}
              <a href="/terms.html" target="_blank" rel="noopener">
                Terms &amp; Conditions
              </a>{" "}
              and{" "}
              <a href="/privacy.html" target="_blank" rel="noopener">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} />
            <span>{strings.invite.marketingLabel}</span>
          </label>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? strings.invite.submitting : strings.invite.submitButton}
          </button>
        </form>
      </div>
    </div>
  );
}
