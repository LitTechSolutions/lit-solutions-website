import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Ticket } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

const CATEGORIES: Array<Ticket["category"]> = ["website_change", "it_support", "question", "other"];
const STATUSES: Ticket["status"][] = ["submitted", "triaged", "assigned", "in_progress", "waiting_on_customer", "resolved", "closed", "reopened"];
const PRIORITY_LEVELS = ["critical", "high", "medium", "low"] as const;

function categoryLabel(category: string): string {
  return (strings.tickets.categoryLabels as Record<string, string>)[category] ?? category;
}

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * platform_admin accounts (legacy session role "admin") have no
 * organization membership at all, so they get the cross-org work queue
 * (StaffWorkQueue) instead of the membership-driven customer flow.
 * Deliberately platform_admin-only, not isStaffRole: technician (legacy
 * "staff") has no workqueue.view capability (src/policy/rbac.js), so
 * routing them here would trade the graceful "not built for you yet"
 * message the membership-empty CustomerTickets path already shows them
 * for a raw backend 403.
 */
export function Tickets() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);

  if (isPlatformAdmin) return <StaffWorkQueue />;
  return <CustomerTickets />;
}

function CustomerTickets() {
  const membershipsState = useMemberships();

  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }

  // First membership -- most customers belong to exactly one
  // organization. A multi-org picker isn't built yet (no account today
  // has more than one), tracked as a follow-up.
  const organizationId = membershipsState.data.memberships[0].organizationId;
  return <TicketsForOrg organizationId={organizationId} />;
}

/**
 * Cross-organization work queue for platform_admin, backed by the
 * existing work-queue.js (F051) -- the one legitimate cross-org query
 * in this codebase, built in an earlier session. Only shows OPEN
 * tickets (work-queue.js's own scope), grouped by priority, with an
 * inline status-transition control per ticket -- there's no
 * single-ticket-fetch route to build a separate detail page against,
 * so this list IS the detail/transition surface. The frontend doesn't
 * duplicate ticketLifecycle.js's legal-transition rules; it offers
 * every status and lets tickets.js's real state machine accept or
 * reject the choice, surfacing whatever error comes back.
 */
function StaffWorkQueue() {
  const fetchQueue = useCallback(() => api.workQueue.fetch(), []);
  const state = useApi(fetchQueue, [], (data) => data.workQueue.totalOpenTickets === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;
  if (state.status === "empty") return <EmptyState title={strings.tickets.workQueueEmptyTitle} body={strings.tickets.workQueueEmptyBody} />;

  const { openTicketsByPriority } = state.data.workQueue;

  return (
    <div>
      <h1>{strings.tickets.workQueueTitle}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
        {PRIORITY_LEVELS.map((level) => {
          const tickets = openTicketsByPriority[level] ?? [];
          if (tickets.length === 0) return null;
          return (
            <section key={level}>
              <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-3)" }}>
                {strings.tickets.priorityLabels[level]} ({tickets.length})
              </h2>
              <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {tickets.map((ticket) => (
                  <StaffTicketRow key={ticket.id} ticket={ticket} onUpdated={state.retry} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StaffTicketRow({ ticket, onUpdated }: { ticket: Ticket; onUpdated: () => void }) {
  const [nextStatus, setNextStatus] = useState<Ticket["status"]>(ticket.status);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition() {
    setTransitioning(true);
    setError(null);
    try {
      await api.tickets.transition({ ticketId: ticket.id, organizationId: ticket.organizationId, nextStatus });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{ticket.subject}</strong>
        <span>{ticket.status.replace(/_/g, " ")}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.tickets.organizationLabel}: {ticket.organizationId} &middot; {categoryLabel(ticket.category)}
      </p>
      <p style={{ marginTop: "var(--space-2)" }}>{ticket.description}</p>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-3)" }}>
        <label className="visually-hidden" htmlFor={`status-${ticket.id}`}>
          {strings.tickets.statusLabel}
        </label>
        <select id={`status-${ticket.id}`} value={nextStatus} onChange={(e) => setNextStatus(e.target.value as Ticket["status"])}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-small" disabled={transitioning || nextStatus === ticket.status} onClick={handleTransition}>
          {transitioning ? strings.tickets.transitioning : strings.tickets.transitionButton}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function TicketsForOrg({ organizationId }: { organizationId: string }) {
  const [showForm, setShowForm] = useState(false);
  const fetchTickets = useCallback(() => api.tickets.list(organizationId), [organizationId]);
  const state = useApi(fetchTickets, [organizationId], (data) => data.tickets.length === 0);

  const handleCreated = () => {
    setShowForm(false);
    state.retry();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
        <h1>{strings.tickets.title}</h1>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setShowForm((v) => !v)}>
          {showForm ? strings.tickets.cancel : strings.tickets.newTicket}
        </button>
      </div>

      {showForm ? <NewTicketForm organizationId={organizationId} onCreated={handleCreated} /> : null}

      {(() => {
        switch (state.status) {
          case "loading":
            return <Loading />;
          case "expired":
            return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
          case "unauthorized":
            return <UnauthorizedState />;
          case "error":
            return <ErrorState body={state.message} onRetry={state.retry} />;
          case "empty":
            return <EmptyState title={strings.tickets.emptyTitle} body={strings.tickets.emptyBody} />;
          case "success":
            return <TicketList tickets={state.data.tickets} />;
        }
      })()}
    </div>
  );
}

function TicketList({ tickets }: { tickets: Ticket[] }) {
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {tickets.map((ticket) => (
        <li key={ticket.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <strong>{ticket.subject}</strong>
            <span className="visually-hidden">Status:</span>
            <span>{ticket.status.replace(/_/g, " ")}</span>
          </div>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
            {categoryLabel(ticket.category)} &middot; {strings.tickets.submittedBy} {new Date(ticket.submittedAt).toLocaleDateString()}
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>{ticket.description}</p>
        </li>
      ))}
    </ul>
  );
}

function NewTicketForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [category, setCategory] = useState<Ticket["category"]>("question");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.tickets.create({ organizationId, category, subject, description });
      setSubject("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
      <div className="field">
        <label htmlFor="ticket-category">{strings.tickets.category}</label>
        <select id="ticket-category" value={category} onChange={(e) => setCategory(e.target.value as Ticket["category"])}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ticket-subject">{strings.tickets.subject}</label>
        <input id="ticket-subject" type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ticket-description">{strings.tickets.description}</label>
        <textarea id="ticket-description" required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? strings.tickets.submitting : strings.tickets.submit}
      </button>
    </form>
  );
}
