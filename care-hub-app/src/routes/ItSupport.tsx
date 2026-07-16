import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { ItSupportClassification } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
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
 * Per rbac.js: ticket.work belongs only to technician (assigned to the
 * specific ticket) and platform_admin (bypasses the assignment check
 * entirely, same gate as tickets.js's PATCH) -- no customer role has it
 * at all. There's also no GET/list endpoint for this resource: it-
 * support.js is POST-only, and a classification result isn't persisted
 * anywhere retrievable -- the only place it's ever visible is the
 * response of the request that created it. So unlike ScopeOfWork/
 * ChangeOrders, there is no customer-readable view here whatsoever --
 * customers get an inverted version of Approvals.tsx's staff-exclusion
 * notice instead, and staff get a one-shot classification form with no
 * list behind it.
 */
export function ItSupport() {
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  if (!isStaff) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.itSupport.customerNotApplicableTitle}
        body={strings.itSupport.customerNotApplicableBody}
      />
    );
  }
  return <StaffItSupport />;
}

function StaffItSupport() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.itSupport.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="it-support-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="it-support-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <TicketPickerForClassification organizationId={activeOrgId} />
        </div>
      ) : null}
    </div>
  );
}

function TicketPickerForClassification({ organizationId }: { organizationId: string }) {
  const fetchTickets = useCallback(() => api.tickets.list(organizationId), [organizationId]);
  const ticketsState = useApi(fetchTickets, [organizationId], (data) => data.tickets.length === 0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  if (ticketsState.status === "loading") return <Loading />;
  if (ticketsState.status === "expired") return <SignInAgain />;
  if (ticketsState.status === "unauthorized") return <UnauthorizedState />;
  if (ticketsState.status === "error") return <ErrorState body={ticketsState.message} onRetry={ticketsState.retry} />;
  if (ticketsState.status === "empty") {
    return <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.scopeOfWork.noTicketsBody}</p>;
  }

  const ticketList = ticketsState.data.tickets;
  const activeTicketId = selectedTicketId ?? ticketList[0].id;

  return (
    <div className="card">
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.itSupport.classifyHeading}</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="it-support-ticket-picker">{strings.scopeOfWork.ticketPickerLabel}</label>
        <select id="it-support-ticket-picker" value={activeTicketId} onChange={(e) => setSelectedTicketId(e.target.value)}>
          {ticketList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.subject}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: "var(--space-4)" }}>
        <ClassificationForm organizationId={organizationId} ticketId={activeTicketId} />
      </div>
    </div>
  );
}

function ClassificationForm({ organizationId, ticketId }: { organizationId: string; ticketId: string }) {
  const [requiresPhysicalAccess, setRequiresPhysicalAccess] = useState(false);
  const [safetyRisk, setSafetyRisk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ItSupportClassification | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { classification } = await api.itSupport.classify({ organizationId, ticketId, requiresPhysicalAccess, safetyRisk });
      setResult(classification);
    } catch (err) {
      // Deliberately no client-side pre-check of assignment here -- if
      // this technician isn't assigned to the ticket, rbac.js's
      // denyResponseFor() 403s and that surfaces right here, same as
      // every other create-form's catch block in this app.
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <input type="checkbox" checked={requiresPhysicalAccess} onChange={(e) => setRequiresPhysicalAccess(e.target.checked)} />
        {strings.itSupport.requiresPhysicalAccessLabel}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <input type="checkbox" checked={safetyRisk} onChange={(e) => setSafetyRisk(e.target.checked)} />
        {strings.itSupport.safetyRiskLabel}
      </label>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={submitting} style={{ marginTop: "var(--space-3)" }}>
        {submitting ? strings.itSupport.submitting : strings.itSupport.submitButton}
      </button>
      {result ? (
        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "var(--space-2)" }}>{strings.itSupport.resultHeading}</h3>
          <p>
            <strong>{strings.itSupport.classificationLabels[result.classification]}</strong>
          </p>
          <p style={{ marginTop: "var(--space-2)", fontSize: "0.9rem", color: "var(--ink-soft)" }}>
            {strings.itSupport.reasonLabel}: {result.reason}
          </p>
        </div>
      ) : null}
    </form>
  );
}
