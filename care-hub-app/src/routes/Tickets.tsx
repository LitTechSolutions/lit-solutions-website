import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Ticket } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { Loading } from "../components/states/Loading";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

const CATEGORIES: Array<Ticket["category"]> = ["website_change", "it_support", "question", "other"];

function categoryLabel(category: string): string {
  return (strings.tickets.categoryLabels as Record<string, string>)[category] ?? category;
}

/**
 * Customer's own-organization ticket list + a create-ticket form,
 * against the real tickets.js endpoint. Requires knowing the caller's
 * organizationId first (my-memberships.js) -- platform_admin/technician
 * accounts have no membership row at all, so this screen honestly tells
 * them it isn't built for their role yet rather than silently failing.
 */
export function Tickets() {
  const membershipsState = useMemberships();

  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
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
