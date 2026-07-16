import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { WebsiteProfile } from "../api/types";
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
 * Per care_hub_auth.js: website-profiles.js's create AND update actions
 * both go through authenticatePlatformAction(), which only accepts the
 * legacy session role "admin" -- technician (legacy "staff") has no
 * special path and is flatly rejected. list/view goes through
 * authenticateForOrg() plus a website-profiles.view capability every
 * customer role (org_owner/org_member/read_only_customer) has. So this
 * is a pure read-only list for customers, and a create-and-edit workflow
 * for platform_admin only -- deliberately platform_admin-only, not
 * isStaffRole: routing a technician into StaffWebsiteProfiles would
 * trade the graceful "not built for you yet" message the
 * membership-empty CustomerWebsiteProfiles path already shows them for a
 * raw backend 403.
 */
export function WebsiteProfiles() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffWebsiteProfiles /> : <CustomerWebsiteProfiles />;
}

function CustomerWebsiteProfiles() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <WebsiteProfileList organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffWebsiteProfiles() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.websiteProfiles.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="website-profiles-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="website-profiles-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <WebsiteProfileList organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function WebsiteProfileList({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchProfiles = useCallback(() => api.websiteProfiles.list(organizationId), [organizationId]);
  const state = useApi(fetchProfiles, [organizationId], (data) => data.profiles.length === 0);

  return (
    <div>
      {!readOnly ? null : <h1>{strings.websiteProfiles.title}</h1>}
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
              return <StateScreen title={strings.websiteProfiles.emptyTitle} body={strings.websiteProfiles.emptyBody} icon="—" />;
            case "success":
              return (
                <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {state.data.profiles.map((profile) => (
                    <WebsiteProfileCard key={profile.id} profile={profile} readOnly={readOnly} onUpdated={state.retry} />
                  ))}
                </ul>
              );
          }
        })()}
      </div>
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <WebsiteProfileForm organizationId={organizationId} onCreated={state.retry} />
        </div>
      ) : null}
    </div>
  );
}

function WebsiteProfileCard({
  profile,
  readOnly,
  onUpdated,
}: {
  profile: WebsiteProfile;
  readOnly: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="card">
        <WebsiteProfileEditForm
          profile={profile}
          onSaved={() => {
            setEditing(false);
            onUpdated();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="card">
      <p>
        <a href={profile.primaryUrl} target="_blank" rel="noopener">
          {profile.primaryUrl}
        </a>
      </p>
      {profile.domainRegistrar ? (
        <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          {strings.websiteProfiles.domainRegistrarLabel}: {profile.domainRegistrar}
        </p>
      ) : null}
      {profile.hostingProvider ? (
        <p style={{ marginTop: "var(--space-1)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          {strings.websiteProfiles.hostingProviderLabel}: {profile.hostingProvider}
        </p>
      ) : null}
      {!readOnly ? (
        <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: "var(--space-3)" }} onClick={() => setEditing(true)}>
          {strings.websiteProfiles.editButton}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Inline edit control, matching ScopeEditor's (ScopeOfWork.tsx) local
 * saving/error useState pattern -- prefilled with the profile's current
 * values, PATCHes via api.websiteProfiles.update() on save, and calls
 * onSaved (which both closes the form and refetches the list via the
 * parent's useApi `retry`) rather than trying to merge the response
 * locally.
 */
function WebsiteProfileEditForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: WebsiteProfile;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [primaryUrl, setPrimaryUrl] = useState(profile.primaryUrl);
  const [domainRegistrar, setDomainRegistrar] = useState(profile.domainRegistrar ?? "");
  const [hostingProvider, setHostingProvider] = useState(profile.hostingProvider ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.websiteProfiles.update({
        profileId: profile.id,
        primaryUrl,
        domainRegistrar: domainRegistrar.trim() || undefined,
        hostingProvider: hostingProvider.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`website-profile-edit-url-${profile.id}`}>{strings.websiteProfiles.primaryUrlFieldLabel}</label>
        <input
          id={`website-profile-edit-url-${profile.id}`}
          type="url"
          required
          value={primaryUrl}
          onChange={(e) => setPrimaryUrl(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor={`website-profile-edit-registrar-${profile.id}`}>{strings.websiteProfiles.domainRegistrarFieldLabel}</label>
        <input
          id={`website-profile-edit-registrar-${profile.id}`}
          type="text"
          value={domainRegistrar}
          onChange={(e) => setDomainRegistrar(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor={`website-profile-edit-hosting-${profile.id}`}>{strings.websiteProfiles.hostingProviderFieldLabel}</label>
        <input
          id={`website-profile-edit-hosting-${profile.id}`}
          type="text"
          value={hostingProvider}
          onChange={(e) => setHostingProvider(e.target.value)}
        />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
          {saving ? strings.websiteProfiles.saving : strings.websiteProfiles.saveButton}
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={saving} onClick={onCancel}>
          {strings.websiteProfiles.cancelButton}
        </button>
      </div>
    </form>
  );
}

function WebsiteProfileForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [domainRegistrar, setDomainRegistrar] = useState("");
  const [hostingProvider, setHostingProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.websiteProfiles.create({
        organizationId,
        primaryUrl,
        domainRegistrar: domainRegistrar.trim() || undefined,
        hostingProvider: hostingProvider.trim() || undefined,
      });
      setPrimaryUrl("");
      setDomainRegistrar("");
      setHostingProvider("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.websiteProfiles.newHeading}</h2>
      <div className="field">
        <label htmlFor="website-profile-url">{strings.websiteProfiles.primaryUrlFieldLabel}</label>
        <input id="website-profile-url" type="url" required value={primaryUrl} onChange={(e) => setPrimaryUrl(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="website-profile-registrar">{strings.websiteProfiles.domainRegistrarFieldLabel}</label>
        <input id="website-profile-registrar" type="text" value={domainRegistrar} onChange={(e) => setDomainRegistrar(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="website-profile-hosting">{strings.websiteProfiles.hostingProviderFieldLabel}</label>
        <input id="website-profile-hosting" type="text" value={hostingProvider} onChange={(e) => setHostingProvider(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.websiteProfiles.creating : strings.websiteProfiles.createButton}
      </button>
    </form>
  );
}
