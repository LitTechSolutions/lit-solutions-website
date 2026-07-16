import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { BackupRecord, TechnologyAsset } from "../api/types";
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

const BACKUP_CATEGORIES: BackupRecord["category"][] = ["source", "content", "assets", "database", "configuration"];

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per care_hub_auth.js: technology-assets.js's create-asset/record-backup/
 * verify-backup actions all go through authenticatePlatformAction(), which
 * requires the legacy session role to be literally "admin" -- technician
 * (legacy "staff") gets no special path and is flatly rejected. So this
 * screen is a pure read-only asset list for every customer role (list
 * goes through authenticateForOrg, which every customer role passes),
 * and a create/record workflow for platform_admin only. Deliberately
 * isPlatformAdminRole, not isStaffRole (see Tickets.tsx/Checklists.tsx
 * for the same reasoning): routing technician in here would trade the
 * graceful "not built for you yet" message the membership-empty
 * CustomerTechnologyAssets path already shows them for a raw backend 403.
 *
 * technology-assets.js's GET now returns `{ assets, backups }` together
 * (both scoped by the same organizationId, both gated by the same
 * asset.view capability), so BackupsSection below renders real,
 * server-persisted BackupRecords and refetches (via the shared useApi
 * `retry`) after recording a new one or marking one restore-verified --
 * nothing here is held in local-only React state across a page reload.
 */
export function TechnologyAssets() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffTechnologyAssets /> : <CustomerTechnologyAssets />;
}

function CustomerTechnologyAssets() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <AssetsForOrg organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffTechnologyAssets() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.technologyAssets.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="technology-assets-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="technology-assets-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <AssetsForOrg organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function AssetsForOrg({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  const fetchAssets = useCallback(() => api.technologyAssets.list(organizationId), [organizationId]);
  // "Empty" requires BOTH lists to be empty -- not just assets -- so that
  // an org with backups but no assets still lands on "success" and
  // BackupsSection gets its real data, rather than being handed the `[]`
  // fallback below (the "empty" RemoteState variant carries no `data` at
  // all, so this distinction is what keeps backups visible whenever they
  // exist, independent of whether there happen to be any assets yet).
  const state = useApi(fetchAssets, [organizationId], (data) => data.assets.length === 0 && data.backups.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const assets = state.status === "success" ? state.data.assets : [];
  const backups = state.status === "success" ? state.data.backups : [];

  return (
    <div>
      {!readOnly ? null : <h1>{strings.technologyAssets.title}</h1>}
      {assets.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: readOnly ? "var(--space-4)" : 0 }}>
          {strings.technologyAssets.emptyBody}
        </p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: readOnly ? "var(--space-4)" : 0 }}>
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </ul>
      )}
      {!readOnly ? (
        <>
          <div style={{ marginTop: "var(--space-5)" }}>
            <NewAssetForm organizationId={organizationId} onCreated={state.retry} />
          </div>
          <div style={{ marginTop: "var(--space-5)" }}>
            <BackupsSection organizationId={organizationId} backups={backups} onChanged={state.retry} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function AssetCard({ asset }: { asset: TechnologyAsset }) {
  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{asset.label}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{asset.type}</span>
      </div>
      {asset.warrantyExpiresAt || asset.licenseExpiresAt ? (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
          {asset.warrantyExpiresAt ? (
            <>
              {strings.technologyAssets.warrantyLabel} {new Date(asset.warrantyExpiresAt).toLocaleDateString()}
            </>
          ) : null}
          {asset.warrantyExpiresAt && asset.licenseExpiresAt ? " · " : null}
          {asset.licenseExpiresAt ? (
            <>
              {strings.technologyAssets.licenseLabel} {new Date(asset.licenseExpiresAt).toLocaleDateString()}
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

function NewAssetForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [type, setType] = useState("");
  const [label, setLabel] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.technologyAssets.createAsset({
        organizationId,
        type,
        label,
        warrantyExpiresAt: warrantyExpiresAt || undefined,
        licenseExpiresAt: licenseExpiresAt || undefined,
      });
      setType("");
      setLabel("");
      setWarrantyExpiresAt("");
      setLicenseExpiresAt("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.technologyAssets.newAssetHeading}</h2>
      <div className="field">
        <label htmlFor="asset-type">{strings.technologyAssets.typeLabel}</label>
        <input id="asset-type" type="text" required value={type} onChange={(e) => setType(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="asset-label">{strings.technologyAssets.labelLabel}</label>
        <input id="asset-label" type="text" required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="asset-warranty">{strings.technologyAssets.warrantyFieldLabel}</label>
        <input id="asset-warranty" type="date" value={warrantyExpiresAt} onChange={(e) => setWarrantyExpiresAt(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="asset-license">{strings.technologyAssets.licenseFieldLabel}</label>
        <input id="asset-license" type="date" value={licenseExpiresAt} onChange={(e) => setLicenseExpiresAt(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={submitting}>
        {submitting ? strings.technologyAssets.creatingAsset : strings.technologyAssets.createAssetButton}
      </button>
    </form>
  );
}

/**
 * `backups` is now the real, server-persisted list for this organization
 * (technology-assets.js's GET returns it alongside `assets`), passed down
 * from AssetsForOrg's useApi state -- recording a new backup or marking
 * one restore-verified calls `onChanged` (that same useApi's `retry`) to
 * refetch, rather than mutating any local copy.
 */
function BackupsSection({
  organizationId,
  backups,
  onChanged,
}: {
  organizationId: string;
  backups: BackupRecord[];
  onChanged: () => void;
}) {
  const [websiteProfileId, setWebsiteProfileId] = useState("");
  const [category, setCategory] = useState<BackupRecord["category"]>("source");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.technologyAssets.recordBackup({ organizationId, websiteProfileId, category, location });
      setWebsiteProfileId("");
      setLocation("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.technologyAssets.backupsHeading}</h2>

      <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
        <div className="field">
          <label htmlFor="backup-website-profile-id">{strings.technologyAssets.websiteProfileIdLabel}</label>
          <input
            id="backup-website-profile-id"
            type="text"
            required
            value={websiteProfileId}
            onChange={(e) => setWebsiteProfileId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="backup-category">{strings.technologyAssets.categoryLabel}</label>
          <select id="backup-category" value={category} onChange={(e) => setCategory(e.target.value as BackupRecord["category"])}>
            {BACKUP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {strings.technologyAssets.categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="backup-location">{strings.technologyAssets.locationLabel}</label>
          <input id="backup-location" type="text" required value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-small" disabled={submitting}>
          {submitting ? strings.technologyAssets.recordingBackup : strings.technologyAssets.recordBackupButton}
        </button>
      </form>

      {backups.length ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          {backups.map((backup) => (
            <BackupCard key={backup.id} backup={backup} onVerified={onChanged} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BackupCard({ backup, onVerified }: { backup: BackupRecord; onVerified: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    try {
      await api.technologyAssets.verifyBackup(backup.id);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{strings.technologyAssets.categoryLabels[backup.category]}</strong>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{backup.location}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.technologyAssets.websiteProfileIdLabel}: {backup.websiteProfileId} &middot; {strings.technologyAssets.takenAtLabel}{" "}
        {new Date(backup.takenAt).toLocaleString()}
      </p>
      <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem" }}>
        {backup.restoreVerified ? strings.technologyAssets.restoreVerifiedLabel : strings.technologyAssets.restoreNotVerifiedLabel}
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {!backup.restoreVerified ? (
        <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: "var(--space-2)" }} disabled={verifying} onClick={handleVerify}>
          {verifying ? strings.technologyAssets.verifyingBackup : strings.technologyAssets.verifyBackupButton}
        </button>
      ) : null}
    </li>
  );
}
