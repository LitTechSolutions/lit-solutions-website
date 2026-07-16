import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { EntitlementUsageView, RecordUsageResult } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per care_hub_auth.js: entitlements.js's recordUsage action goes through
 * authenticatePlatformAction(), which requires the legacy session role to
 * be literally "admin" -- technician (legacy "staff") gets no special
 * path and is flatly rejected. The view action goes through
 * authenticateForOrg, which every customer role passes. Deliberately
 * isPlatformAdminRole, not isStaffRole (see Tickets.tsx/Checklists.tsx
 * for the same reasoning): routing technician in here would trade the
 * graceful "not built for you yet" message the membership-empty
 * CustomerEntitlements path already shows them for a raw backend 403.
 *
 * entitlements.js's GET now accepts organizationId+planKey with usageKey
 * OMITTED, returning { views: [...] } covering every usage key configured
 * for that plan. Combined with subscriptions.js's already-existing list
 * endpoint (which ties an org to its planKey), that's enough to show a
 * real "everything this org has" usage overview automatically -- no
 * schema change, no new Organization field, just chaining two endpoints
 * that already exist. That overview lives ABOVE the manual planKey/
 * usageKey lookup form below, which stays as an advanced/manual fallback
 * for a plan/usage combination the org's current subscription doesn't
 * cover (e.g. a plan not tied to any subscription yet, or checking a
 * single usage key in isolation).
 */
export function Entitlements() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffEntitlements /> : <CustomerEntitlements />;
}

function CustomerEntitlements() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }

  const organizationId = membershipsState.data.memberships[0].organizationId;
  return (
    <div>
      <h1>{strings.entitlements.title}</h1>
      <div style={{ marginTop: "var(--space-5)", maxWidth: 480 }}>
        <EntitlementsOverview organizationId={organizationId} />
      </div>
      <div style={{ marginTop: "var(--space-5)", maxWidth: 480 }}>
        <EntitlementLookupForm organizationId={organizationId} />
      </div>
    </div>
  );
}

function StaffEntitlements() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.entitlements.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="entitlements-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="entitlements-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-5)", maxWidth: 480 }}>
          <EntitlementsOverview organizationId={activeOrgId} />
          <EntitlementLookupForm organizationId={activeOrgId} />
          <RecordUsageForm organizationId={activeOrgId} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Auto-discovers usage for an org's current plan: fetch its subscriptions
 * (already-built subscriptions.js endpoint), take the first `active` one,
 * then fetch every usage key configured for that plan in one shot. An org
 * with no active subscription is a normal, expected state (e.g. brand new
 * org) -- shown as a plain message, never as an error.
 */
function EntitlementsOverview({ organizationId }: { organizationId: string }) {
  const fetchSubscriptions = useCallback(() => api.subscriptions.list(organizationId), [organizationId]);
  const state = useApi(fetchSubscriptions, [organizationId], (data) => data.subscriptions.length === 0);

  return (
    <div className="card">
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.entitlements.overviewHeading}</h2>
      {(() => {
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
            return <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{strings.entitlements.noActiveSubscriptionBody}</p>;
          case "success": {
            const active = state.data.subscriptions.find((s) => s.status === "active");
            if (!active) {
              return <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{strings.entitlements.noActiveSubscriptionBody}</p>;
            }
            return <PlanUsageTable organizationId={organizationId} planKey={active.planKey} />;
          }
        }
      })()}
    </div>
  );
}

function PlanUsageTable({ organizationId, planKey }: { organizationId: string; planKey: string }) {
  const fetchViews = useCallback(() => api.entitlements.listForPlan(organizationId, planKey), [organizationId, planKey]);
  const state = useApi(fetchViews, [organizationId, planKey], (data) => data.views.length === 0);

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
      return <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{strings.entitlements.noLimitsConfiguredBody}</p>;
    case "success":
      return (
        <div>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "var(--space-3)" }}>
            {strings.entitlements.planKeyLabel}: {planKey}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                  {strings.entitlements.usageKeyLabel}
                </th>
                <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                  {strings.entitlements.limitLabel}
                </th>
                <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                  {strings.entitlements.resetPeriodLabel}
                </th>
                <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                  {strings.entitlements.consumedLabel}
                </th>
                <th style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                  {strings.entitlements.remainingLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.views.map((view) => (
                <tr key={view.limit.usageKey}>
                  <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{view.limit.usageKey}</td>
                  <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                    {view.limit.resetPeriod === "unlimited" ? strings.entitlements.unlimitedLabel : view.limit.limit}
                  </td>
                  <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                    {strings.entitlements.resetPeriodLabels[view.limit.resetPeriod]}
                  </td>
                  <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>{view.consumed}</td>
                  <td style={{ padding: "var(--space-2)", borderBottom: "1px solid var(--line)" }}>
                    {view.limit.resetPeriod === "unlimited" ? strings.entitlements.unlimitedLabel : view.remaining}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function EntitlementLookupForm({ organizationId }: { organizationId: string }) {
  const [planKey, setPlanKey] = useState("");
  const [usageKey, setUsageKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EntitlementUsageView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const usage = await api.entitlements.view(organizationId, planKey.trim(), usageKey.trim());
      setResult(usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-2)" }}>{strings.entitlements.lookupHeading}</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "var(--space-3)" }}>{strings.entitlements.lookupHelp}</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div className="field">
          <label htmlFor="entitlement-plan-key">{strings.entitlements.planKeyLabel}</label>
          <input id="entitlement-plan-key" type="text" required value={planKey} onChange={(e) => setPlanKey(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="entitlement-usage-key">{strings.entitlements.usageKeyLabel}</label>
          <input id="entitlement-usage-key" type="text" required value={usageKey} onChange={(e) => setUsageKey(e.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-small" disabled={loading}>
          {loading ? strings.entitlements.checking : strings.entitlements.checkUsageButton}
        </button>
      </form>
      {result ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <p>
            <strong>{strings.entitlements.limitLabel}:</strong>{" "}
            {result.limit.resetPeriod === "unlimited" ? strings.entitlements.unlimitedLabel : result.limit.limit}
          </p>
          <p>
            <strong>{strings.entitlements.consumedLabel}:</strong> {result.consumed}
          </p>
          <p>
            <strong>{strings.entitlements.remainingLabel}:</strong>{" "}
            {result.limit.resetPeriod === "unlimited" ? strings.entitlements.unlimitedLabel : result.remaining}
          </p>
          <p>
            <strong>{strings.entitlements.periodStartLabel}:</strong> {new Date(result.periodStart).toLocaleDateString()}
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            {strings.entitlements.resetPeriodLabel}: {strings.entitlements.resetPeriodLabels[result.limit.resetPeriod]}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RecordUsageForm({ organizationId }: { organizationId: string }) {
  const [planKey, setPlanKey] = useState("");
  const [usageKey, setUsageKey] = useState("");
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecordUsageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await api.entitlements.recordUsage(organizationId, planKey.trim(), usageKey.trim(), Number(amount) || 1);
      setResult(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.entitlements.recordUsageHeading}</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div className="field">
          <label htmlFor="record-usage-plan-key">{strings.entitlements.planKeyLabel}</label>
          <input id="record-usage-plan-key" type="text" required value={planKey} onChange={(e) => setPlanKey(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="record-usage-usage-key">{strings.entitlements.usageKeyLabel}</label>
          <input id="record-usage-usage-key" type="text" required value={usageKey} onChange={(e) => setUsageKey(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="record-usage-amount">{strings.entitlements.amountLabel}</label>
          <input id="record-usage-amount" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-small" disabled={loading}>
          {loading ? strings.entitlements.recording : strings.entitlements.recordUsageButton}
        </button>
      </form>
      {result ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <p>
            <strong>{strings.entitlements.recordedLabel}:</strong> {result.recorded ? strings.entitlements.yesLabel : strings.entitlements.noLabel}
          </p>
          <p>
            <strong>{strings.entitlements.withinLimitLabel}:</strong>{" "}
            {result.withinLimit ? strings.entitlements.yesLabel : strings.entitlements.noLabel}
          </p>
          <p>
            <strong>{strings.entitlements.remainingLabel}:</strong> {result.remaining}
          </p>
          {result.reason ? <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{result.reason}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
