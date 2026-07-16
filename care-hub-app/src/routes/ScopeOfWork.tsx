import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { LineItem, ScopeOfWork as ScopeOfWorkType } from "../api/types";
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
 * Per rbac.js: scope.create belongs only to technician (assigned) and
 * platform_admin -- no customer role (org_owner/org_member/
 * read_only_customer) can create or version a scope, only view it. So
 * this screen is a pure read-only list for customers, and a create/
 * version workflow for staff -- there's no "customer requests a
 * change" action here at all (that's what tickets are for).
 */
export function ScopeOfWork() {
  const { state: authState } = useAuth();
  const isStaff = authState.status === "signedIn" && isStaffRole(authState.user.role);
  return isStaff ? <StaffScopeOfWork /> : <CustomerScopeOfWork />;
}

function CustomerScopeOfWork() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <TicketPicker organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffScopeOfWork() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.scopeOfWork.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="scope-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="scope-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <TicketPicker organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function TicketPicker({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchTickets = useCallback(() => api.tickets.list(organizationId), [organizationId]);
  const state = useApi(fetchTickets, [organizationId], (data) => data.tickets.length === 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  switch (state.status) {
    case "loading":
      return <Loading />;
    case "expired":
      return <SignInAgain />;
    case "unauthorized":
      return <UnauthorizedState />;
    case "error":
      return <ErrorState body={state.message} onRetry={state.retry} />;
    case "empty":
      return <StateScreen title={strings.scopeOfWork.noTicketsTitle} body={strings.scopeOfWork.noTicketsBody} icon="—" />;
    case "success": {
      const ticketList = state.data.tickets;
      const activeId = selectedId ?? ticketList[0].id;
      return (
        <div>
          {!readOnly ? null : <h1>{strings.scopeOfWork.title}</h1>}
          <div className="field" style={{ maxWidth: 420, marginTop: readOnly ? "var(--space-4)" : 0 }}>
            <label htmlFor="scope-ticket-picker">{strings.scopeOfWork.ticketPickerLabel}</label>
            <select id="scope-ticket-picker" value={activeId} onChange={(e) => setSelectedId(e.target.value)}>
              {ticketList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subject}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: "var(--space-5)" }}>
            <ScopeForTicket organizationId={organizationId} ticketId={activeId} readOnly={readOnly} />
          </div>
        </div>
      );
    }
  }
}

function ScopeForTicket({ organizationId, ticketId, readOnly }: { organizationId: string; ticketId: string; readOnly: boolean }) {
  const fetchScopes = useCallback(() => api.scopeOfWork.list(organizationId, ticketId), [organizationId, ticketId]);
  const state = useApi(fetchScopes, [organizationId, ticketId], (data) => data.scopes.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const scopes = state.status === "success" ? state.data.scopes : [];
  const current = scopes.find((s) => s.status !== "superseded") ?? scopes[scopes.length - 1];

  return (
    <div>
      {scopes.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.scopeOfWork.noScopeBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {[...scopes]
            .sort((a, b) => b.version - a.version)
            .map((scope) => (
              <ScopeVersionCard key={scope.id} scope={scope} isCurrent={scope.id === current?.id} />
            ))}
        </ul>
      )}
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <ScopeEditor organizationId={organizationId} ticketId={ticketId} current={current ?? null} onSaved={state.retry} />
        </div>
      ) : null}
    </div>
  );
}

function ScopeVersionCard({ scope, isCurrent }: { scope: ScopeOfWorkType; isCurrent: boolean }) {
  return (
    <li className="card">
      <p>
        <strong>{strings.scopeOfWork.versionLabel(scope.version)}</strong>{" "}
        <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>
          ({strings.scopeOfWork.statusLabels[scope.status]}
          {isCurrent ? `, ${strings.scopeOfWork.currentBadge}` : ""})
        </span>
      </p>
      <ul style={{ marginTop: "var(--space-2)" }}>
        {scope.lineItems.map((item, i) => (
          <li key={i} style={{ fontSize: "0.9rem" }}>
            {item.description} &times; {item.quantity}
          </li>
        ))}
      </ul>
      {scope.assumptions.length ? (
        <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          {strings.scopeOfWork.assumptionsLabel}: {scope.assumptions.join("; ")}
        </p>
      ) : null}
      {scope.exclusions.length ? (
        <p style={{ marginTop: "var(--space-1)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          {strings.scopeOfWork.exclusionsLabel}: {scope.exclusions.join("; ")}
        </p>
      ) : null}
    </li>
  );
}

function ScopeEditor({
  organizationId,
  ticketId,
  current,
  onSaved,
}: {
  organizationId: string;
  ticketId: string;
  current: ScopeOfWorkType | null;
  onSaved: () => void;
}) {
  const [lineItems, setLineItems] = useState<LineItem[]>(current?.lineItems ?? [{ description: "", quantity: 1, priceRef: "" }]);
  const [assumptions, setAssumptions] = useState(current?.assumptions.join("\n") ?? "");
  const [exclusions, setExclusions] = useState(current?.exclusions.join("\n") ?? "");
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
    const cleanedAssumptions = assumptions.split("\n").map((s) => s.trim()).filter(Boolean);
    const cleanedExclusions = exclusions.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      if (current) {
        await api.scopeOfWork.createNextVersion({
          scopeId: current.id,
          organizationId,
          assumptions: cleanedAssumptions,
          exclusions: cleanedExclusions,
          lineItems: cleanedItems,
        });
      } else {
        await api.scopeOfWork.create({ organizationId, ticketId, assumptions: cleanedAssumptions, exclusions: cleanedExclusions, lineItems: cleanedItems });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>
        {current ? strings.scopeOfWork.newVersionHeading : strings.scopeOfWork.newScopeHeading}
      </h2>
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
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="scope-assumptions">{strings.scopeOfWork.assumptionsFieldLabel}</label>
        <textarea id="scope-assumptions" rows={2} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-2)" }}>
        <label htmlFor="scope-exclusions">{strings.scopeOfWork.exclusionsFieldLabel}</label>
        <textarea id="scope-exclusions" rows={2} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.scopeOfWork.saving : current ? strings.scopeOfWork.saveNewVersion : strings.scopeOfWork.createScope}
      </button>
    </form>
  );
}
