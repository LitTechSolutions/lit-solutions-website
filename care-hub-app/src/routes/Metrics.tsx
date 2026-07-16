import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { MetricsSummary } from "../api/types";
import { strings } from "../strings/en";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { StateScreen } from "../components/states/StateScreen";

/**
 * Per metrics.js: metrics.view goes through authenticatePlatformAction()
 * (care_hub_auth.js) -- the legacy session role must be literally
 * "admin". Genuinely cross-organization (an operational dashboard, not a
 * per-customer view, same shape as the work queue), so no customer role
 * and no technician has any capability here -- same StateScreen "notice"
 * pattern as Approvals.tsx's staff exclusion, reflecting a hard backend
 * boundary rather than a real 403.
 *
 * Nothing fetches on mount -- there's no summary worth showing until a
 * platform_admin actually picks a date range, so this uses local
 * useState (not useApi) the same way ScopeEditor/ChangeOrderForm use
 * local saving/error state for a submit-triggered action, just reading
 * instead of writing.
 */
export function Metrics() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.metrics.notPlatformAdminTitle}
        body={strings.metrics.notPlatformAdminBody}
      />
    );
  }
  return <PlatformAdminMetrics />;
}

type MetricsRequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; summary: MetricsSummary };

function PlatformAdminMetrics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<MetricsRequestState>({ status: "idle" });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const { summary } = await api.metrics.summary(from, to);
      setState({ status: "success", summary });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : strings.states.errorBody });
    }
  }

  return (
    <div>
      <h1>{strings.metrics.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="metrics-from">{strings.metrics.fromLabel}</label>
          <input id="metrics-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="metrics-to">{strings.metrics.toLabel}</label>
          <input id="metrics-to" type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small" disabled={state.status === "loading"}>
          {state.status === "loading" ? strings.metrics.submitting : strings.metrics.submitButton}
        </button>
      </form>

      {state.status === "error" ? (
        <p className="field-error" role="alert" style={{ marginTop: "var(--space-3)" }}>
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? <MetricsResults summary={state.summary} /> : null}
    </div>
  );
}

function MetricsResults({ summary }: { summary: MetricsSummary }) {
  const byTypeEntries = Object.entries(summary.byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byDayEntries = Object.entries(summary.byDay).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
      <MetricsTable heading={strings.metrics.byTypeHeading} columnLabel={strings.metrics.typeColumnLabel} entries={byTypeEntries} />
      <MetricsTable heading={strings.metrics.byDayHeading} columnLabel={strings.metrics.dayColumnLabel} entries={byDayEntries} />
    </div>
  );
}

function MetricsTable({ heading, columnLabel, entries }: { heading: string; columnLabel: string; entries: [string, number][] }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{heading}</h2>
      {entries.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.metrics.emptyBody}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{columnLabel}</th>
              <th style={{ textAlign: "right", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                {strings.metrics.countColumnLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([label, count]) => (
              <tr key={label}>
                <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{label}</td>
                <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)", textAlign: "right" }}>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
