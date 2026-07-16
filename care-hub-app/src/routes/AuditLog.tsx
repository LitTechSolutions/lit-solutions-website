import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { AuditEvent } from "../api/types";
import { strings } from "../strings/en";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { StateScreen } from "../components/states/StateScreen";

/**
 * Per audit-log.js: audit.review goes through authenticatePlatformAction()
 * (care_hub_auth.js) -- the legacy session role must be literally
 * "admin". Same hard boundary as Templates.tsx/Metrics.tsx: no customer
 * role, no technician, same StateScreen "notice" pattern as Approvals.tsx's
 * staff exclusion instead of a real 403.
 *
 * Filter-driven, not fetch-on-mount -- audit-log.js has no unfiltered
 * "everything, newest first, across every organization" view worth
 * loading by default, so this uses local useState the same way
 * Metrics.tsx's date-range form does, plus cursor-based "Load more"
 * pagination that reuses whatever filters were last submitted.
 */
export function AuditLog() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.auditLog.notPlatformAdminTitle}
        body={strings.auditLog.notPlatformAdminBody}
      />
    );
  }
  return <PlatformAdminAuditLog />;
}

interface AuditFilters {
  organizationId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

type AuditLogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; events: AuditEvent[]; nextCursor: string | null };

function buildFilters(fields: {
  organizationId: string;
  actorId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
}): AuditFilters {
  const filters: AuditFilters = {};
  if (fields.organizationId.trim()) filters.organizationId = fields.organizationId.trim();
  if (fields.actorId.trim()) filters.actorId = fields.actorId.trim();
  if (fields.action.trim()) filters.action = fields.action.trim();
  if (fields.dateFrom) filters.dateFrom = fields.dateFrom;
  if (fields.dateTo) filters.dateTo = fields.dateTo;
  return filters;
}

function PlatformAdminAuditLog() {
  const [organizationId, setOrganizationId] = useState("");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeFilters, setActiveFilters] = useState<AuditFilters>({});
  const [state, setState] = useState<AuditLogState>({ status: "idle" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const filters = buildFilters({ organizationId, actorId, action, dateFrom, dateTo });
    setActiveFilters(filters);
    setState({ status: "loading" });
    setLoadMoreError(null);
    try {
      const page = await api.auditLog.query(filters);
      setState({ status: "success", events: page.events, nextCursor: page.nextCursor });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : strings.states.errorBody });
    }
  }

  async function handleLoadMore() {
    if (state.status !== "success" || !state.nextCursor) return;
    const cursor = state.nextCursor;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await api.auditLog.query({ ...activeFilters, cursor });
      setState((prev) =>
        prev.status === "success"
          ? { status: "success", events: [...prev.events, ...page.events], nextCursor: page.nextCursor }
          : prev
      );
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <h1>{strings.auditLog.title}</h1>
      <form
        className="card"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)" }}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="audit-org-id">{strings.auditLog.organizationIdLabel}</label>
          <input id="audit-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="audit-actor-id">{strings.auditLog.actorIdLabel}</label>
          <input id="audit-actor-id" type="text" value={actorId} onChange={(e) => setActorId(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="audit-action">{strings.auditLog.actionLabel}</label>
          <input id="audit-action" type="text" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="audit-date-from">{strings.auditLog.dateFromLabel}</label>
          <input id="audit-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="audit-date-to">{strings.auditLog.dateToLabel}</label>
          <input id="audit-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small" disabled={state.status === "loading"}>
          {state.status === "loading" ? strings.auditLog.searching : strings.auditLog.searchButton}
        </button>
      </form>

      {state.status === "error" ? (
        <p className="field-error" role="alert" style={{ marginTop: "var(--space-3)" }}>
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <AuditEventsTable events={state.events} />
          {loadMoreError ? (
            <p className="field-error" role="alert" style={{ marginTop: "var(--space-3)" }}>
              {loadMoreError}
            </p>
          ) : null}
          {state.nextCursor ? (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              style={{ marginTop: "var(--space-4)" }}
              disabled={loadingMore}
              onClick={handleLoadMore}
            >
              {loadingMore ? strings.auditLog.loadingMore : strings.auditLog.loadMore}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const OUTCOME_COLOR: Record<AuditEvent["outcome"], string> = {
  success: "var(--accent-teal-text)",
  failure: "var(--error-text)",
  denied: "var(--error-text)",
};

function AuditEventsTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.auditLog.emptyBody}</p>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.occurredAtColumnLabel}
          </th>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.actorColumnLabel}
          </th>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.actionColumnLabel}
          </th>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.targetColumnLabel}
          </th>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.organizationColumnLabel}
          </th>
          <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
            {strings.auditLog.outcomeColumnLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
              {new Date(event.occurredAt).toLocaleString()}
            </td>
            <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
              {`${strings.auditLog.actorTypeLabels[event.actorType]} ${event.actorId}${event.actorRole ? ` (${event.actorRole})` : ""}`}
            </td>
            <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{event.action}</td>
            <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
              {[event.targetType, event.targetId].filter(Boolean).join(" ")}
            </td>
            <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{event.organizationId ?? ""}</td>
            <td
              style={{
                padding: "var(--space-2)",
                borderBottom: "1px solid var(--line)",
                color: OUTCOME_COLOR[event.outcome],
                fontWeight: 600,
              }}
            >
              {strings.auditLog.outcomeLabels[event.outcome]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
