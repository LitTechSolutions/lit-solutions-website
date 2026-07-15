import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";

/**
 * The MFA challenge for a platform_admin account that already has TOTP
 * enabled (see MfaEnroll.tsx for first-time setup). Reached only via
 * auth-login.js's enrollmentRequired: false response.
 */
export function MfaVerify() {
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = useRecoveryCode ? await api.auth.mfaVerifyRecoveryCode(recoveryCode) : await api.auth.mfaVerifyCode(code);
      setSignedIn(result.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.mfaIncorrectCode);
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
          <h1 className="visually-hidden">{strings.auth.mfaCodeTitle}</h1>
          {useRecoveryCode ? (
            <div className="field">
              <label htmlFor="mfa-recovery-code">{strings.auth.mfaRecoveryLabel}</label>
              <input
                id="mfa-recovery-code"
                type="text"
                autoComplete="off"
                required
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="mfa-verify-code">{strings.auth.mfaCodeLabel}</label>
              <input
                id="mfa-verify-code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          )}
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? strings.auth.mfaVerifying : strings.auth.mfaVerifyButton}
          </button>
          <button
            type="button"
            className="auth-card__toggle"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setError(null);
            }}
          >
            {useRecoveryCode ? strings.auth.mfaUseAuthenticatorCode : strings.auth.mfaUseRecoveryCode}
          </button>
        </form>
      </div>
    </div>
  );
}
