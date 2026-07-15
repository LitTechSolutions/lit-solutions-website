import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";

/**
 * First-time TOTP setup for a platform_admin account, reached only via
 * auth-login.js's enrollmentRequired: true response (the short-lived
 * lts_mfa_pending cookie is what actually authorizes mfa-enroll.js --
 * this page has no client-side access to it, doesn't need to, and
 * doesn't try to gate itself on anything beyond "did the server accept
 * the start/confirm calls").
 */
export function MfaEnroll() {
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();

  const [phase, setPhase] = useState<"loading" | "confirm" | "recoveryCodes" | "error">("loading");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingUser, setPendingUser] = useState<Parameters<typeof setSignedIn>[0] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.auth
      .mfaEnrollStart()
      .then((result) => {
        if (cancelled) return;
        setSecret(result.secret);
        setPhase("confirm");
      })
      .catch((err) => {
        if (cancelled) return;
        setStartError(err instanceof Error ? err.message : strings.auth.noPendingSignIn);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setConfirming(true);
    setConfirmError(null);
    try {
      const result = await api.auth.mfaEnrollConfirm(code);
      setRecoveryCodes(result.recoveryCodes);
      setPendingUser(result.user);
      setPhase("recoveryCodes");
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : strings.auth.mfaIncorrectCode);
    } finally {
      setConfirming(false);
    }
  }

  function handleContinue() {
    if (pendingUser) setSignedIn(pendingUser);
    navigate("/");
  }

  if (phase === "loading") return <Loading />;
  if (phase === "error") {
    return (
      <div className="auth-page">
        <ErrorState body={startError ?? undefined} onRetry={() => navigate("/login")} />
      </div>
    );
  }

  if (phase === "recoveryCodes") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1>{strings.auth.mfaRecoveryCodesTitle}</h1>
          <p>{strings.auth.mfaRecoveryCodesBody}</p>
          <ul className="auth-card__recovery-codes">
            {recoveryCodes.map((rc) => (
              <li key={rc}>{rc}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block" onClick={handleContinue}>
            {strings.auth.mfaRecoveryCodesContinue}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1>{strings.auth.mfaEnrollTitle}</h1>
        <p>{strings.auth.mfaEnrollBody}</p>
        <div className="field">
          <label htmlFor="mfa-secret">{strings.auth.mfaEnrollManualKeyLabel}</label>
          <p id="mfa-secret" className="auth-card__secret">
            {secret}
          </p>
        </div>
        <form className="auth-card__form" onSubmit={handleConfirm}>
          <div className="field">
            <label htmlFor="mfa-enroll-code">{strings.auth.mfaCodeLabel}</label>
            <input
              id="mfa-enroll-code"
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
          {confirmError ? (
            <p className="field-error" role="alert">
              {confirmError}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={confirming}>
            {confirming ? strings.auth.mfaEnrollConfirming : strings.auth.mfaEnrollConfirmButton}
          </button>
        </form>
      </div>
    </div>
  );
}
