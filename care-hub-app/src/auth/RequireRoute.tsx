import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { canAccessRoute } from "./navAccess";
import type { RouteKey } from "./navAccess";

/**
 * A second, narrower gate layered inside RequireAuth (which only checks
 * "is there a session at all") for the handful of routes that are
 * entirely off-limits to some roles rather than just differently-
 * rendered -- Organizations/Templates/Metrics/AuditLog (platform_admin
 * only), IT Support/Work Log (staff-or-admin only), Activity Timeline
 * (customer only). Redirects the wrong role straight to the dashboard
 * instead of letting them land on a URL whose only content is a "not
 * available" notice -- see navAccess.ts for the access table this reads.
 *
 * Purely additive: each of those routes' own component still keeps its
 * internal role check (e.g. Organizations.tsx's isPlatformAdminRole
 * branch) as a second line of defense. This only closes the gap where a
 * customer could still type the URL and see a dead-end page at all.
 */
export function RequireRoute({ routeKey, children }: { routeKey: RouteKey; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null; // RequireAuth above this already handles every non-signed-in case
  if (!canAccessRoute(state.user.role, routeKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
