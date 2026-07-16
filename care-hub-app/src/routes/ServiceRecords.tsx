import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { ServiceRecord } from "../api/types";
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

const CATEGORIES: Array<ServiceRecord["category"]> = ["website", "it", "security", "recurring_service"];
const STATUSES: Array<ServiceRecord["status"]> = ["active", "on_hold", "completed", "cancelled"];

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per care_hub_auth.js: service-records.js's create/setStatus actions go
 * through authenticatePlatformAction(), which only accepts the legacy
 * session role "admin" -- technician (legacy "staff") has no special
 * path and is flatly rejected. list/view goes through
 * authenticateForOrg() plus a service-records.view capability every
 * customer role (org_owner/org_member/read_only_customer) has. So this
 * is a pure read-only list for customers, and a create + status-
 * transition workflow for platform_admin only -- deliberately
 * platform_admin-only, not isStaffRole: routing a technician into
 * StaffServiceRecords would trade the graceful "not built for you yet"
 * message the membership-empty CustomerServiceRecords path already shows
 * them for a raw backend 403.
 */
export function ServiceRecords() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffServiceRecords /> : <CustomerServiceRecords />;
}

function CustomerServiceRecords() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <ServiceRecordList organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffServiceRecords() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.serviceRecords.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="service-records-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="service-records-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ServiceRecordList organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function ServiceRecordList({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchRecords = useCallback(() => api.serviceRecords.list(organizationId), [organizationId]);
  const state = useApi(fetchRecords, [organizationId], (data) => data.records.length === 0);

  return (
    <div>
      {!readOnly ? null : <h1>{strings.serviceRecords.title}</h1>}
      <div style={{ marginTop: readOnly ? "var(--space-4)" : 0 }}>
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
              return <StateScreen title={strings.serviceRecords.emptyTitle} body={strings.serviceRecords.emptyBody} icon="—" />;
            case "success":
              return (
                <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {state.data.records.map((record) =>
                    readOnly ? (
                      <ServiceRecordCard key={record.id} record={record} />
                    ) : (
                      <StaffServiceRecordRow key={record.id} record={record} onUpdated={state.retry} />
                    )
                  )}
                </ul>
              );
          }
        })()}
      </div>
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ServiceRecordForm organizationId={organizationId} onCreated={state.retry} />
        </div>
      ) : null}
    </div>
  );
}

function ServiceRecordCard({ record }: { record: ServiceRecord }) {
  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{record.title}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>{strings.serviceRecords.statusLabels[record.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.serviceRecords.categoryLabels[record.category]} &middot; {strings.serviceRecords.createdLabel}{" "}
        {new Date(record.createdAt).toLocaleDateString()}
      </p>
    </li>
  );
}

function StaffServiceRecordRow({ record, onUpdated }: { record: ServiceRecord; onUpdated: () => void }) {
  const [nextStatus, setNextStatus] = useState<ServiceRecord["status"]>(record.status);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition() {
    setTransitioning(true);
    setError(null);
    try {
      await api.serviceRecords.setStatus(record.id, nextStatus);
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
        <strong>{record.title}</strong>
        <span>{strings.serviceRecords.statusLabels[record.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.serviceRecords.categoryLabels[record.category]} &middot; {strings.serviceRecords.createdLabel}{" "}
        {new Date(record.createdAt).toLocaleDateString()}
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-3)" }}>
        <label className="visually-hidden" htmlFor={`service-record-status-${record.id}`}>
          {strings.serviceRecords.statusLabel}
        </label>
        <select
          id={`service-record-status-${record.id}`}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as ServiceRecord["status"])}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {strings.serviceRecords.statusLabels[s]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-small" disabled={transitioning || nextStatus === record.status} onClick={handleTransition}>
          {transitioning ? strings.serviceRecords.transitioning : strings.serviceRecords.transitionButton}
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

function ServiceRecordForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [category, setCategory] = useState<ServiceRecord["category"]>("website");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.serviceRecords.create({ organizationId, category, title });
      setTitle("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.serviceRecords.newHeading}</h2>
      <div className="field">
        <label htmlFor="service-record-category">{strings.serviceRecords.categoryLabel}</label>
        <select id="service-record-category" value={category} onChange={(e) => setCategory(e.target.value as ServiceRecord["category"])}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {strings.serviceRecords.categoryLabels[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="service-record-title">{strings.serviceRecords.titleFieldLabel}</label>
        <input id="service-record-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.serviceRecords.creating : strings.serviceRecords.createButton}
      </button>
    </form>
  );
}
