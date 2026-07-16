import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { ChangeOrder, LineItem } from "../api/types";
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
 * Per rbac.js: change_order.create belongs only to technician (assigned)
 * and platform_admin, same as scope.create -- see ScopeOfWork.tsx's own
 * comment. Every role can change_order.view, so the list itself is
 * always read-only for customers; only staff get the creation form
 * below it.
 */
export function ChangeOrders() {
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  return isStaff ? <StaffChangeOrders /> : <CustomerChangeOrders />;
}

function CustomerChangeOrders() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <ChangeOrderList organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffChangeOrders() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.changeOrders.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="co-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="co-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ChangeOrderList organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function ChangeOrderList({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchChangeOrders = useCallback(() => api.changeOrders.list(organizationId), [organizationId]);
  const state = useApi(fetchChangeOrders, [organizationId], (data) => data.changeOrders.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const changeOrderList = state.status === "success" ? state.data.changeOrders : [];

  return (
    <div>
      {!readOnly ? null : <h1>{strings.changeOrders.title}</h1>}
      {readOnly ? (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>{strings.changeOrders.approvalHint}</p>
      ) : null}
      {changeOrderList.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.changeOrders.noChangeOrdersBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {changeOrderList.map((co) => (
            <ChangeOrderCard key={co.id} changeOrder={co} />
          ))}
        </ul>
      )}
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ChangeOrderCreator organizationId={organizationId} onCreated={state.retry} />
        </div>
      ) : null}
    </div>
  );
}

function ChangeOrderCard({ changeOrder }: { changeOrder: ChangeOrder }) {
  return (
    <li className="card">
      <p>{changeOrder.description}</p>
      <ul style={{ marginTop: "var(--space-2)" }}>
        {changeOrder.addedLineItems.map((item, i) => (
          <li key={i} style={{ fontSize: "0.9rem" }}>
            {item.description} &times; {item.quantity}
          </li>
        ))}
      </ul>
      <p style={{ marginTop: "var(--space-2)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
        {new Date(changeOrder.createdAt).toLocaleDateString()}
      </p>
    </li>
  );
}

function ChangeOrderCreator({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
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
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.changeOrders.newHeading}</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="co-ticket-picker">{strings.scopeOfWork.ticketPickerLabel}</label>
        <select id="co-ticket-picker" value={activeTicketId} onChange={(e) => setSelectedTicketId(e.target.value)}>
          {ticketList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.subject}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: "var(--space-4)" }}>
        <ChangeOrderFormForTicket organizationId={organizationId} ticketId={activeTicketId} onCreated={onCreated} />
      </div>
    </div>
  );
}

function ChangeOrderFormForTicket({
  organizationId,
  ticketId,
  onCreated,
}: {
  organizationId: string;
  ticketId: string;
  onCreated: () => void;
}) {
  const fetchScopes = useCallback(() => api.scopeOfWork.list(organizationId, ticketId), [organizationId, ticketId]);
  const state = useApi(fetchScopes, [organizationId, ticketId], (data) => data.scopes.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const scopes = state.status === "success" ? state.data.scopes : [];
  const current = scopes.find((s) => s.status !== "superseded") ?? scopes[scopes.length - 1];

  if (!current) {
    return <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.changeOrders.noCurrentScopeBody}</p>;
  }

  return <ChangeOrderForm organizationId={organizationId} originalScopeId={current.id} scopeVersion={current.version} onCreated={onCreated} />;
}

function ChangeOrderForm({
  organizationId,
  originalScopeId,
  scopeVersion,
  onCreated,
}: {
  organizationId: string;
  originalScopeId: string;
  scopeVersion: number;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, priceRef: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const cleanedItems = lineItems.filter((it) => it.description.trim());
    try {
      await api.changeOrders.create({ organizationId, originalScopeId, description, addedLineItems: cleanedItems });
      setDescription("");
      setLineItems([{ description: "", quantity: 1, priceRef: "" }]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginBottom: "var(--space-3)" }}>
        {strings.changeOrders.originalScopeLabel(scopeVersion)}
      </p>
      <div className="field">
        <label htmlFor="co-description">{strings.changeOrders.descriptionLabel}</label>
        <textarea id="co-description" rows={2} required value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>
        <p style={{ fontSize: "0.9rem", marginBottom: "var(--space-2)" }}>{strings.changeOrders.addedLineItemsHeading}</p>
        {lineItems.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <input
              aria-label={strings.scopeOfWork.lineItemDescriptionLabel}
              type="text"
              placeholder={strings.scopeOfWork.lineItemDescriptionLabel}
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              style={{ flex: 2 }}
            />
            <input
              aria-label={strings.scopeOfWork.lineItemQuantityLabel}
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 1 })}
              style={{ flex: 1 }}
            />
            <input
              aria-label={strings.scopeOfWork.lineItemPriceRefLabel}
              type="text"
              placeholder={strings.scopeOfWork.lineItemPriceRefLabel}
              value={item.priceRef}
              onChange={(e) => updateItem(i, { priceRef: e.target.value })}
              style={{ flex: 1 }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => setLineItems((items) => [...items, { description: "", quantity: 1, priceRef: "" }])}
        >
          {strings.scopeOfWork.addLineItem}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.changeOrders.creating : strings.changeOrders.createButton}
      </button>
    </form>
  );
}
