import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Reminder } from "../api/types";
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
 * Per care_hub_auth.js: reminders.js's create action goes through
 * authenticatePlatformAction(), which only accepts the legacy session
 * role "admin" -- technician (legacy "staff") has no special path and is
 * flatly rejected. list/view goes through authenticateForOrg() plus a
 * reminders.view capability every customer role (org_owner/org_member/
 * read_only_customer) has. So this is a pure read-only list for
 * customers, and a create workflow for platform_admin only --
 * deliberately platform_admin-only, not isStaffRole: routing a
 * technician into StaffReminders would trade the graceful "not built for
 * you yet" message the membership-empty CustomerReminders path already
 * shows them for a raw backend 403.
 *
 * There is no update/mark-done endpoint at all -- the `sent` boolean is
 * flipped by a background process, not exposed via HTTP -- so this
 * screen never offers a "mark done" action, only a small badge when
 * `sent` is already true.
 */
export function Reminders() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffReminders /> : <CustomerReminders />;
}

function CustomerReminders() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <ReminderList organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffReminders() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.reminders.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="reminders-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="reminders-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ReminderList organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function ReminderList({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchReminders = useCallback(() => api.reminders.list(organizationId), [organizationId]);
  const state = useApi(fetchReminders, [organizationId], (data) => data.reminders.length === 0);

  return (
    <div>
      {!readOnly ? null : <h1>{strings.reminders.title}</h1>}
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
              return <StateScreen title={strings.reminders.emptyTitle} body={strings.reminders.emptyBody} icon="—" />;
            case "success": {
              const sorted = [...state.data.reminders].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
              return (
                <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {sorted.map((reminder) => (
                    <ReminderCard key={reminder.id} reminder={reminder} />
                  ))}
                </ul>
              );
            }
          }
        })()}
      </div>
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ReminderForm organizationId={organizationId} onCreated={state.retry} />
        </div>
      ) : null}
    </div>
  );
}

function ReminderCard({ reminder }: { reminder: Reminder }) {
  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{reminder.subjectType}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>{reminder.subjectId}</span>
      </div>
      <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
        {strings.reminders.expiresAtLabel}: {new Date(reminder.expiresAt).toLocaleDateString()}
      </p>
      {reminder.sent ? (
        <span
          style={{ display: "inline-block", marginTop: "var(--space-2)", color: "var(--accent-teal-text)", fontSize: "0.75rem", fontWeight: 600 }}
        >
          {strings.reminders.sentBadge}
        </span>
      ) : null}
    </li>
  );
}

function ReminderForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [subjectId, setSubjectId] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.reminders.create({ organizationId, subjectId, subjectType, expiresAt });
      setSubjectId("");
      setSubjectType("");
      setExpiresAt("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.reminders.newHeading}</h2>
      <div className="field">
        <label htmlFor="reminder-subject-id">{strings.reminders.subjectIdFieldLabel}</label>
        <input
          id="reminder-subject-id"
          type="text"
          required
          placeholder={strings.reminders.subjectIdFieldPlaceholder}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="reminder-subject-type">{strings.reminders.subjectTypeFieldLabel}</label>
        <input
          id="reminder-subject-type"
          type="text"
          required
          placeholder={strings.reminders.subjectTypeFieldPlaceholder}
          value={subjectType}
          onChange={(e) => setSubjectType(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="reminder-expires-at">{strings.reminders.expiresAtFieldLabel}</label>
        <input id="reminder-expires-at" type="date" required value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.reminders.creating : strings.reminders.createButton}
      </button>
    </form>
  );
}
