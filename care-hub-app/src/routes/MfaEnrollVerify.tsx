import { useEffect, useState } from "react";
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
 * clicking this link is very often not the one that started enrollment
 * -- so this page authenticates purely via the ?token= in the URL, same
 * as the public site's password-reset confirmation link.
 */
export function MfaEnrollVerify() {
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [phase, setPhase] = useState<"verifying" | "recoveryCodes" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingUser, setPendingUser] = useState<Parameters<typeof setSignedIn>[0] | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This confirmation link is missing its token.");
      setPhase("error");
      return;
    }
    let cancelled = false;
    api.auth
      .mfaEnrollVerifyEmail(token)
      .then((result) => {
        if (cancelled) return;
        setRecoveryCodes(result.recoveryCodes);
        setPendingUser(result.user);
        setPhase("recoveryCodes");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "This confirmation link is invalid or has expired.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleContinue() {
    if (pendingUser) setSignedIn(pendingUser);
    navigate("/");
  }

  if (phase === "verifying") return <Loading />;

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
