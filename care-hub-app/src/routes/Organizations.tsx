import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Invitation, Organization } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

const ORG_STATUSES: Organization["status"][] = ["active", "suspended", "archived"];

// invitations.js 400s on anything outside this set -- org_owner/org_member/
// read_only_customer -- since platform_admin/technician accounts are always
// provisioned out of band, never invited. Invitation["role"] is the wider
// RoleName union (it also covers rows created before/outside this UI), so
// this is intentionally its own narrower local type, not an import from
// api/types.ts.
type InvitableRole = "org_owner" | "org_member" | "read_only_customer";
const INVITABLE_ROLES: InvitableRole[] = ["org_owner", "org_member", "read_only_customer"];

// Mirrors Tickets.tsx's categoryLabel() -- Invitation["role"] is the full
// 5-value RoleName union (existing rows could theoretically carry any of
// them), but strings.organizations.invitationRoleLabels only defines the 3
// invitable roles above, so a direct index needs this same safe-fallback cast.
function invitationRoleLabel(role: Invitation["role"]): string {
  return (strings.organizations.invitationRoleLabels as Record<string, string>)[role] ?? role;
}

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per organizations.js/invitations.js: every action on this screen goes
 * through authenticatePlatformAction(), which requires the legacy session
 * role to be literally "admin" (platform_admin) -- isPlatformAdminRole, not
 * isStaffRole. technician (legacy "staff") gets no special access to
 * organization or invitation management at all, same as any customer role
 * -- so this is a hard platform_admin-only screen: everyone else gets a
 * plain "not available" notice and zero API calls. Mirrors Approvals.tsx's
 * staff-exclusion pattern, just inverted (there, staff are excluded from a
 * customer-only screen; here, everyone but platform_admin is excluded from
 * a staff-only one).
 *
 * Invitation management lives on this same screen rather than as a
 * separate one: invitations.js is the only way a Care Hub customer account
 * is ever created (registration is invite-only, see InvitationAccept.tsx
 * for the accept-half), and the natural admin workflow is "create or find
 * an organization, then invite its owner" -- splitting that into two
 * disconnected screens would be worse UX for no real benefit.
 */
export function Organizations() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);

  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.organizations.notAvailableTitle}
        body={strings.organizations.notAvailableBody}
      />
    );
  }

  return <StaffOrganizations />;
}

function StaffOrganizations() {
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);

  return (
    <div>
      <h1>{strings.organizations.title}</h1>
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
        <CreateOrganizationForm onCreated={setActiveOrg} />
        <LookupOrganizationForm onLoaded={setActiveOrg} />
      </div>

      {activeOrg ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <OrganizationDetail key={activeOrg.id} organization={activeOrg} onStatusChanged={setActiveOrg} />
          <div style={{ marginTop: "var(--space-5)" }}>
            <InvitationsSection organizationId={activeOrg.id} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateOrganizationForm({ onCreated }: { onCreated: (organization: Organization) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { organization } = await api.organizations.create({ name });
      setName("");
      onCreated(organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ flex: "1 1 320px" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.organizations.createHeading}</h2>
      <div className="field">
        <label htmlFor="org-create-name">{strings.organizations.nameLabel}</label>
        <input id="org-create-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.organizations.creating : strings.organizations.createButton}
      </button>
    </form>
  );
}

function LookupOrganizationForm({ onLoaded }: { onLoaded: (organization: Organization) => void }) {
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedId = organizationId.trim();
    if (!trimmedId) return;
    setLoading(true);
    setError(null);
    try {
      const { organization } = await api.organizations.get(trimmedId);
      onLoaded(organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ flex: "1 1 320px" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.organizations.lookupHeading}</h2>
      <div className="field">
        <label htmlFor="org-lookup-id">{strings.checklists.staffOrgPickerLabel}</label>
        <input id="org-lookup-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={loading} style={{ marginTop: "var(--space-3)" }}>
        {loading ? strings.organizations.lookingUp : strings.checklists.staffLoadButton}
      </button>
    </form>
  );
}

function OrganizationDetail({
  organization,
  onStatusChanged,
}: {
  organization: Organization;
  onStatusChanged: (organization: Organization) => void;
}) {
  const [nextStatus, setNextStatus] = useState<Organization["status"]>(organization.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition() {
    setSaving(true);
    setError(null);
    try {
      const { organization: updated } = await api.organizations.setStatus(organization.id, nextStatus);
      onStatusChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{organization.name}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{strings.organizations.statusLabels[organization.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.organizations.idLabel}: {organization.id}
      </p>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-1)" }}>
        {strings.organizations.createdAtLabel} {new Date(organization.createdAt).toLocaleDateString()}
        {" · "}
        {strings.organizations.versionLabel}: {organization.version}
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-3)" }}>
        <label className="visually-hidden" htmlFor="org-status-select">
          {strings.organizations.statusLabel}
        </label>
        <select id="org-status-select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as Organization["status"])}>
          {ORG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {strings.organizations.statusLabels[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={saving || nextStatus === organization.status}
          onClick={handleTransition}
        >
          {saving ? strings.organizations.updatingStatus : strings.organizations.updateStatusButton}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function InvitationsSection({ organizationId }: { organizationId: string }) {
  const fetchInvitations = useCallback(() => api.invitations.list(organizationId), [organizationId]);
  const state = useApi(fetchInvitations, [organizationId], (data) => data.invitations.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const invitationList = state.status === "success" ? state.data.invitations : [];

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem" }}>{strings.organizations.invitationsHeading}</h2>
      {invitationList.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.organizations.noInvitationsBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {invitationList.map((invitation) => (
            <InvitationCard key={invitation.id} invitation={invitation} onChanged={state.retry} />
          ))}
        </ul>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <SendInvitationForm organizationId={organizationId} onSent={state.retry} />
      </div>
    </div>
  );
}

function InvitationCard({ invitation, onChanged }: { invitation: Invitation; onChanged: () => void }) {
  const [working, setWorking] = useState<"revoke" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setWorking("resend");
    setError(null);
    try {
      await api.invitations.resend(invitation.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setWorking(null);
    }
  }

  async function handleRevoke() {
    setWorking("revoke");
    setError(null);
    try {
      await api.invitations.revoke(invitation.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setWorking(null);
    }
  }

  const isPending = invitation.status === "pending";

  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{invitation.email}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{strings.organizations.invitationStatusLabels[invitation.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>{invitationRoleLabel(invitation.role)}</p>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.8rem", marginTop: "var(--space-2)" }}>
        {strings.organizations.invitedLabel} {new Date(invitation.createdAt).toLocaleDateString()}
        {" · "}
        {strings.organizations.expiresLabel} {new Date(invitation.expiresAt).toLocaleDateString()}
        {" · "}
        {strings.organizations.resendCountLabel}: {invitation.resendCount}
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {isPending ? (
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          <button type="button" className="btn btn-ghost btn-small" disabled={working !== null} onClick={handleResend}>
            {working === "resend" ? strings.organizations.resending : strings.organizations.resendButton}
          </button>
          <button type="button" className="btn btn-ghost btn-small" disabled={working !== null} onClick={handleRevoke}>
            {working === "revoke" ? strings.organizations.revoking : strings.organizations.revokeButton}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function SendInvitationForm({ organizationId, onSent }: { organizationId: string; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("org_owner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.invitations.create({ organizationId, email, role });
      setEmail("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.organizations.inviteHeading}</h2>
      <div className="field">
        <label htmlFor="invite-email">{strings.organizations.inviteEmailLabel}</label>
        <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="invite-role">{strings.organizations.inviteRoleLabel}</label>
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {strings.organizations.invitationRoleLabels[r]}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.organizations.inviting : strings.organizations.inviteButton}
      </button>
    </form>
  );
}
