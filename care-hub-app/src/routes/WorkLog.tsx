import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
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
 * Per rbac.js: worklog.write and note.internal.write both belong only to
 * technician (assigned to the specific ticket) and platform_admin
 * (bypasses the assignment check entirely) -- no customer role has
 * either, same shape as ItSupport.tsx. There's no list endpoint for time
 * entries or notes, only a running total (GET /work-log?ticketId=) and
 * two independent POST actions -- so like IT Support, customers get an
 * inverted staff-exclusion notice and there is no customer-facing branch
 * at all.
 */
export function WorkLog() {
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  if (!isStaff) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.workLog.customerNotApplicableTitle}
        body={strings.workLog.customerNotApplicableBody}
      />
    );
  }
  return <StaffWorkLog />;
}

function StaffWorkLog() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.workLog.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="work-log-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="work-log-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <TicketPickerForWorkLog organizationId={activeOrgId} />
        </div>
      ) : null}
    </div>
  );
}

function TicketPickerForWorkLog({ organizationId }: { organizationId: string }) {
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
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="work-log-ticket-picker">{strings.scopeOfWork.ticketPickerLabel}</label>
        <select id="work-log-ticket-picker" value={activeTicketId} onChange={(e) => setSelectedTicketId(e.target.value)}>
          {ticketList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.subject}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: "var(--space-4)" }}>
        <WorkLogForTicket organizationId={organizationId} ticketId={activeTicketId} />
      </div>
    </div>
  );
}

function WorkLogForTicket({ organizationId, ticketId }: { organizationId: string; ticketId: string }) {
  // No natural "empty" reading for a running total (it's a scalar, not a
  // list) -- same 2-arg useApi() call as Checklists.tsx's
  // StaffChecklistDetail/Account.tsx's fetchAccount, and the same
  // "status === 'empty' -> null" branch those use to satisfy the type
  // even though isEmpty's default (() => false) means it never actually
  // fires at runtime.
  const fetchTotal = useCallback(() => api.workLog.total(ticketId, organizationId), [ticketId, organizationId]);
  const totalState = useApi(fetchTotal, [ticketId, organizationId]);

  if (totalState.status === "loading") return <Loading />;
  if (totalState.status === "expired") return <SignInAgain />;
  if (totalState.status === "unauthorized") return <UnauthorizedState />;
  if (totalState.status === "error") return <ErrorState body={totalState.message} onRetry={totalState.retry} />;
  if (totalState.status === "empty") return null;

  const { totalMinutes } = totalState.data;

  return (
    <div>
      <p style={{ marginBottom: "var(--space-4)" }}>
        <strong>{strings.workLog.totalHeading}:</strong> {strings.workLog.totalMinutesLabel(totalMinutes)}
      </p>
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <LogTimeForm organizationId={organizationId} ticketId={ticketId} onLogged={totalState.retry} />
        <AddNoteForm organizationId={organizationId} ticketId={ticketId} />
      </div>
    </div>
  );
}

function LogTimeForm({ organizationId, ticketId, onLogged }: { organizationId: string; ticketId: string; onLogged: () => void }) {
  const [minutes, setMinutes] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.workLog.recordTime(ticketId, organizationId, minutes, note.trim() || undefined);
      setMinutes(0);
      setNote("");
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ flex: 1, minWidth: 260 }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.workLog.logTimeHeading}</h2>
      <div className="field">
        <label htmlFor="work-log-minutes">{strings.workLog.minutesLabel}</label>
        <input id="work-log-minutes" type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-2)" }}>
        <label htmlFor="work-log-time-note">{strings.workLog.timeNoteLabel}</label>
        <input id="work-log-time-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.workLog.logging : strings.workLog.logButton}
      </button>
    </form>
  );
}

function AddNoteForm({ organizationId, ticketId }: { organizationId: string; ticketId: string }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      // note.internal.write's response ({ note: unknown }) is
      // intentionally untyped on the backend side -- there's nothing to
      // read back from it, just success/failure to acknowledge.
      await api.workLog.recordNote(ticketId, organizationId, body);
      setBody("");
      setStatus(strings.workLog.noteSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ flex: 1, minWidth: 260 }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.workLog.addNoteHeading}</h2>
      <div className="field">
        <label htmlFor="work-log-note-body">{strings.workLog.noteBodyLabel}</label>
        <textarea id="work-log-note-body" rows={3} required value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.workLog.addingNote : strings.workLog.addNoteButton}
      </button>
    </form>
  );
}
