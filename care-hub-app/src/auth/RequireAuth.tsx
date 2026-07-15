import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AppShell } from "../components/AppShell";
import { Loading } from "../components/states/Loading";

/**
 * Gates every real Care Hub screen behind a signed-in session, and
 * wraps them in the app shell once gated -- /login, /mfa/enroll, and
 * /mfa/verify render outside this (see App.tsx), since none of them
 * should show the signed-in nav frame.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth();

  if (state.status === "checking") return <Loading />;
  if (state.status === "signedOut") return <Navigate to="/login" replace />;

  return (
    <AppShell userName={state.user.name} onSignOut={signOut}>
      {children}
    </AppShell>
  );
}
