import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { useApi } from "../hooks/useApi";
import { strings } from "../strings/en";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import type { AccountPreferences, AuthenticatedUser } from "../api/types";

const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["zh", "中文"],
  ["ja", "日本語"],
  ["vi", "Tiếng Việt"],
  ["tl", "Filipino"],
  ["ar", "العربية"],
  ["ko", "한국어"],
  ["de", "Deutsch"],
  ["ht", "Kreyòl Ayisyen"],
  ["pt", "Português"],
  ["ru", "Русский"],
  ["it", "Italiano"],
  ["pl", "Polski"],
  ["hi", "हिन्दी"],
];

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Replaces the ComingSoon stub. account.js and mfa-manage.js both already
 * existed and were already used elsewhere (Dashboard.tsx calls
 * account.js's GET) -- this is the first screen to expose their write
 * actions, none of which had a corresponding api/client.ts method before
 * this screen needed them.
 */
export function Account() {
  const fetchAccount = useCallback(() => api.account.get(), []);
  const state = useApi(fetchAccount, []);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;
  if (state.status === "empty") return null; // never actually reached -- account.js always returns a user

  const { user } = state.data;
  return (
    <div>
      <div className="card">
        <p>
          {strings.account.signedInAs} <strong>{user.name}</strong> ({user.email}).
        </p>
      </div>
      <NameSection user={user} onSaved={state.retry} />
      <EmailSection currentEmail={user.email} />
      <PasswordSection />
      <PreferencesSection preferences={user.preferences} onSaved={state.retry} />
      {isPlatformAdminRole(user.role) ? <MfaSection /> : null}
    </div>
  );
}

function NameSection({ user, onSaved }: { user: AuthenticatedUser; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await api.account.updateName(name);
      setStatus(strings.account.saved);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: "var(--space-4)" }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.account.nameHeading}</h2>
      <div className="field">
        <label htmlFor="account-name">{strings.account.nameLabel}</label>
        <input id="account-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-2)" }}>
        {saving ? strings.account.saving : strings.account.nameSubmit}
      </button>
    </form>
  );
}

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const { signOut } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.account.updateEmail(currentPassword, newEmail);
      // update-email revokes every session and clears the cookie
      // server-side (account.js's "rotate on privilege change" rule) --
      // the client must treat success here as an implicit sign-out.
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: "var(--space-4)" }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.account.emailHeading}</h2>
      <div className="field">
        <label htmlFor="account-new-email">{strings.account.newEmailLabel}</label>
        <input id="account-new-email" type="email" placeholder={currentEmail} required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="account-email-pw">{strings.account.currentPasswordLabel}</label>
        <input
          id="account-email-pw"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--ink-faint)" }}>{strings.account.signOutNotice}</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-2)" }}>
        {saving ? strings.account.saving : strings.account.emailSubmit}
      </button>
    </form>
  );
}

function PasswordSection() {
  const { signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.account.updatePassword(currentPassword, newPassword);
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: "var(--space-4)" }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.account.passwordHeading}</h2>
      <div className="field">
        <label htmlFor="account-current-pw">{strings.account.currentPasswordLabel}</label>
        <input
          id="account-current-pw"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="account-new-pw">{strings.account.newPasswordLabel}</label>
        <input
          id="account-new-pw"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--ink-faint)" }}>{strings.account.signOutNotice}</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-2)" }}>
        {saving ? strings.account.saving : strings.account.passwordSubmit}
      </button>
    </form>
  );
}

function PreferencesSection({ preferences, onSaved }: { preferences: AccountPreferences; onSaved: () => void }) {
  const [language, setLanguage] = useState(preferences.language);
  const [timezone, setTimezone] = useState(preferences.timezone);
  const [emailNotifications, setEmailNotifications] = useState(preferences.emailNotifications);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await api.account.updatePreferences({ language, timezone, emailNotifications });
      setStatus(strings.account.saved);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: "var(--space-4)" }} onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.account.preferencesHeading}</h2>
      <div className="field">
        <label htmlFor="account-language">{strings.account.languageLabel}</label>
        <select id="account-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="account-timezone">{strings.account.timezoneLabel}</label>
        <input id="account-timezone" type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} />
        {strings.account.emailNotificationsLabel}
      </label>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.account.saving : strings.account.preferencesSubmit}
      </button>
    </form>
  );
}

function MfaSection() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!password) {
      setError(strings.account.mfaPasswordLabel);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.auth.mfaReset(password);
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.account.mfaHeading}</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{strings.account.mfaBody}</p>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="account-mfa-pw">{strings.account.mfaPasswordLabel}</label>
        <input id="account-mfa-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-ghost btn-small" disabled={saving} onClick={handleReset} style={{ marginTop: "var(--space-2)" }}>
        {saving ? strings.account.saving : strings.account.mfaResetButton}
      </button>
    </div>
  );
}
