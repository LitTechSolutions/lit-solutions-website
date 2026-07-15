import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { strings } from "../strings/en";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";

/**
 * Landing page for the confirmation link mfa-enroll.js emails when the
 * "confirm" step defers activation (Session 20 step 8 -- the real
 * preventive fix for step 10's Critical MFA-enrollment-hijack finding).
 * Reached with no session and no lts_mfa_pending cookie -- the browser
 * clicking this link is very often not the one that started enrollment.
 * Opening an email must never perform the state-changing request: the user
 * explicitly confirms here so link scanners and previews cannot activate MFA.
 */
export function MfaEnrollVerify() {
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [phase, setPhase] = useState<"confirm" | "verifying" | "recoveryCodes" | "error">(token ? "confirm" : "error");
  const [error, setError] = useState<string | null>(token ? null : strings.auth.mfaEmailMissingToken);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingUser, setPendingUser] = useState<Parameters<typeof setSignedIn>[0] | null>(null);

  async function handleConfirm() {
    if (!token) return;
    setPhase("verifying");
    try {
      const result = await api.auth.mfaEnrollVerifyEmail(token);
      setRecoveryCodes(result.recoveryCodes);
      setPendingUser(result.user);
      setPhase("recoveryCodes");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.mfaEmailInvalid);
      setPhase("error");
    }
  }

  function handleContinue() {
    if (pendingUser) setSignedIn(pendingUser);
    navigate("/");
  }

  if (phase === "verifying") return <Loading />;

  if (phase === "confirm") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1>{strings.auth.mfaEmailConfirmTitle}</h1>
          <p>{strings.auth.mfaEmailConfirmBody}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={handleConfirm}>
            {strings.auth.mfaEmailConfirmButton}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="auth-page">
        <ErrorState body={error ?? undefined} onRetry={() => navigate("/login")} />
      </div>
    );
  }

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
