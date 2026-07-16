import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { Approval } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole, isStaffRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per rbac.js: approval.view/scope.approve/change_order.approve belong
 * to org_owner and to platform_admin (an owner-decision bypass, so
 * platform_admin can record an approval/rejection on a customer's
 * behalf) -- never to org_member, read_only_customer, or technician.
 * Approvals are the customer's independent check on staff-proposed
 * scope/change-order work, so the bypass deliberately stops at
 * platform_admin and doesn't extend to technician, who may have
 * authored the very scope/change-order being decided.
 */
export function Approvals() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  if (isPlatformAdmin) return <StaffApprovals />;
  if (isStaff) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.approvals.staffNotApplicableTitle}
        body={strings.approvals.staffNotApplicableBody}
      />
    );
  }
  return <CustomerApprovals />;
}

function StaffApprovals() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.approvals.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="approvals-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="approvals-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ApprovalsForOrg organizationId={activeOrgId} showHeading={false} />
        </div>
      ) : null}
    </div>
  );
}

function CustomerApprovals() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  const membership = membershipsState.data.memberships[0];
  // org_member/read_only_customer belong to a real organization but
  // rbac.js never grants either role approval.view -- only org_owner.
  if (membership.role !== "org_owner") return <UnauthorizedState />;
  return <ApprovalsForOrg organizationId={membership.organizationId} />;
}

function ApprovalsForOrg({ organizationId, showHeading = true }: { organizationId: string; showHeading?: boolean }) {
  const fetchApprovals = useCallback(() => api.approvals.list(organizationId), [organizationId]);
  const state = useApi(fetchApprovals, [organizationId], (data) => data.approvals.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const approvalsList = state.status === "success" ? state.data.approvals : [];

  return (
    <div>
      {showHeading ? <h1>{strings.approvals.title}</h1> : null}
      {approvalsList.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-4)" }}>{strings.approvals.emptyBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          {approvalsList.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} organizationId={organizationId} onDecided={state.retry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalCard({
  approval,
  organizationId,
  onDecided,
}: {
  approval: Approval;
  organizationId: string;
  onDecided: () => void;
}) {
  const [decisionNote, setDecisionNote] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decisionAction: "approve" | "reject") {
    setDeciding(decisionAction);
    setError(null);
    try {
      await api.approvals.decide({
        approvalId: approval.id,
        organizationId,
        subjectType: approval.subjectType,
        decisionAction,
        decisionNote: decisionNote.trim() || undefined,
      });
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setDeciding(null);
    }
  }

  const isPending = approval.status === "pending";

  return (
    <li className="card">
      <p>
        <strong>{strings.approvals.subjectTypeLabels[approval.subjectType]}</strong>{" "}
        <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>({strings.approvals.statusLabels[approval.status]})</span>
      </p>
      <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
        {strings.approvals.requestedLabel} {new Date(approval.requestedAt).toLocaleDateString()}
        {" · "}
        {strings.approvals.expiresLabel} {new Date(approval.expiresAt).toLocaleDateString()}
      </p>
      {approval.decisionNote ? (
        <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem" }}>
          {strings.approvals.decisionNoteLabel}: {approval.decisionNote}
        </p>
      ) : null}
      {isPending ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <div className="field">
            <label htmlFor={`decision-note-${approval.id}`}>{strings.approvals.decisionNoteFieldLabel}</label>
            <textarea id={`decision-note-${approval.id}`} rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <button type="button" className="btn btn-primary btn-small" disabled={deciding !== null} onClick={() => decide("approve")}>
              {deciding === "approve" ? strings.approvals.deciding : strings.approvals.approveButton}
            </button>
            <button type="button" className="btn btn-ghost btn-small" disabled={deciding !== null} onClick={() => decide("reject")}>
              {deciding === "reject" ? strings.approvals.deciding : strings.approvals.rejectButton}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
