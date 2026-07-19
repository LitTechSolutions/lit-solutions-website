import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { strings } from "../strings/en";

/**
 * Pre-auth password recovery, covering both halves of the flow behind
 * one route: no ?token= means "request a link" (admin/staff and
 * customers alike -- auth-password-reset.js figures out which page the
 * emailed link should point to from the account's own role), a present
 * ?token= means "set a new password". This is the admin/staff
 * equivalent of myaccount.html's #reset-request/#reset hash views --
 * previously only reachable from the now-removed admin.html.
 */
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  if (token) return <ConfirmForm token={token} />;
  return <RequestForm />;
}

function RequestForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.auth.passwordResetRequest(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.resetPassword.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <p className="auth-card__brand">
            {strings.app.brand} <strong>{strings.app.name}</strong>
          </p>
          <h1>{strings.resetPassword.requestTitle}</h1>
          <p>{strings.resetPassword.requestSentBody}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate("/login")}>
            {strings.resetPassword.goToSignIn}
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
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <h1 className="visually-hidden">{strings.resetPassword.requestTitle}</h1>
          <div className="field">
            <label htmlFor="reset-email">{strings.resetPassword.emailLabel}</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? strings.resetPassword.sending : strings.resetPassword.sendButton}
          </button>
          <button type="button" className="auth-card__toggle" onClick={() => navigate("/login")}>
            {strings.resetPassword.backToSignIn}
          </button>
        </form>
      </div>
    </div>
  );
}

function ConfirmForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.auth.passwordResetConfirm(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.resetPassword.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <p className="auth-card__brand">
            {strings.app.brand} <strong>{strings.app.name}</strong>
          </p>
          <h1>{strings.resetPassword.doneTitle}</h1>
          <p>{strings.resetPassword.doneBody}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate("/login")}>
            {strings.resetPassword.goToSignIn}
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
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <h1 className="visually-hidden">{strings.resetPassword.confirmTitle}</h1>
          <div className="field">
            <label htmlFor="reset-new-password">{strings.resetPassword.newPasswordLabel}</label>
            <input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? strings.resetPassword.updating : strings.resetPassword.updateButton}
          </button>
          <button type="button" className="auth-card__toggle" onClick={() => navigate("/login")}>
            {strings.resetPassword.backToSignIn}
          </button>
        </form>
      </div>
    </div>
  );
}
