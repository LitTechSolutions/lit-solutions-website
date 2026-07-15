import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";

/**
 * The one entry point into the Care Hub. auth-login.js's response shape
 * decides where this sends the user next: a real session (LoginResult)
 * means a non-admin account -- straight to the dashboard. mfaRequired
 * means an admin account -- on to /mfa/enroll (first time) or
 * /mfa/verify (already set up), per enrollmentRequired. This page never
 * issues a session itself for an admin account; only mfa-enroll.js/
 * mfa-verify.js do that, matching the backend's actual trust boundary.
 */
export function Login() {
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.auth.login(email, password);
      if ("mfaRequired" in result) {
        navigate(result.enrollmentRequired ? "/mfa/enroll" : "/mfa/verify");
        return;
      }
      setSignedIn(result.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.invalidCredentials);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <p className="auth-card__brand">
          {strings.app.brand} <strong>{strings.app.name}</strong>
        </p>
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <h1 className="visually-hidden">{strings.auth.loginTitle}</h1>
          <div className="field">
            <label htmlFor="login-email">{strings.auth.email}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">{strings.auth.password}</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? strings.auth.signingIn : strings.auth.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}
