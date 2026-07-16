import { useCallback } from "react";
import { api } from "../api/client";
import type { ActivityEvent } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { useAuth } from "../auth/AuthContext";
import { isStaffRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per rbac.js: history.view belongs to all 3 customer roles (org_owner/
 * org_member/read_only_customer) and to NO staff role at all --
 * technician/platform_admin don't have it in ROLE_CAPABILITIES.
 * activity-timeline.js's own route comment explains why: staff already
 * have F051's work-queue.js for cross-ticket visibility, so this is
 * deliberately a customer-only view. Unlike ScopeOfWork/ChangeOrders,
 * there is no staff branch here at all -- just this one exclusion check.
 */
export function ActivityTimeline() {
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  if (isStaff) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.activityTimeline.staffNotApplicableTitle}
        body={strings.activityTimeline.staffNotApplicableBody}
      />
    );
  }
  return <CustomerActivityTimeline />;
}

function CustomerActivityTimeline() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <TimelineForOrg organizationId={membershipsState.data.memberships[0].organizationId} />;
}

function TimelineForOrg({ organizationId }: { organizationId: string }) {
  const fetchTimeline = useCallback(() => api.activityTimeline.list(organizationId), [organizationId]);
  const state = useApi(fetchTimeline, [organizationId], (data) => data.timeline.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  // Backend's buildTimeline() already sorts descending and filters by
  // customerVisible before this ever reaches the client -- this re-sort
  // is the same defensive belt-and-suspenders the rest of the app applies
  // (see ScopeOfWork.tsx's ScopeVersionCard list), not a correction of
  // anything the server gets wrong.
  const events =
    state.status === "success"
      ? [...state.data.timeline].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      : [];

  return (
    <div>
      <h1>{strings.activityTimeline.title}</h1>
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.activityTimeline.emptyBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          {events.map((event) => (
            <ActivityEventCard key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityEventCard({ event }: { event: ActivityEvent }) {
  return (
    <li className="card">
      <p>{event.summary}</p>
      <p style={{ marginTop: "var(--space-2)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>{new Date(event.occurredAt).toLocaleString()}</p>
    </li>
  );
}
