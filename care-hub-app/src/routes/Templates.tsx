import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { RenderedTemplate, TemplateDefinition } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import type { RemoteState } from "../hooks/useApi";
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
 * Per templates.js: both create and render/preview go through
 * authenticatePlatformAction() (care_hub_auth.js) plus the shared
 * platform.configure capability -- templates are global, not org-scoped,
 * configuration, and the legacy session role must be literally "admin".
 * No customer role and no technician has any capability here at all, so
 * this is platform_admin-only with no exceptions -- same StateScreen
 * "notice" pattern as Approvals.tsx's staff exclusion, reflecting a hard
 * backend boundary rather than a real 403.
 *
 * templates.js's GET handler now supports a bare `GET /templates` (no
 * `key` param) that lists every template definition, so the "existing
 * templates" section below is a real useApi-driven fetch, refetched after
 * a successful create -- no more session-local-only bookkeeping. The
 * render/preview form still requires the caller to submit a key (there's
 * no render-without-a-key mode), but now that real templates are
 * fetchable, its key field is a <select> populated from the fetched list
 * when at least one template exists (falling back to free text before
 * any template has been created yet), and choosing one auto-fills the
 * variable-name rows from that template's allowedVariables.
 */
export function Templates() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.templates.notPlatformAdminTitle}
        body={strings.templates.notPlatformAdminBody}
      />
    );
  }
  return <PlatformAdminTemplates />;
}

function PlatformAdminTemplates() {
  const fetchTemplates = useCallback(() => api.templates.list(), []);
  const state = useApi(fetchTemplates, [], (data) => data.definitions.length === 0);
  const templates = state.status === "success" ? state.data.definitions : [];

  return (
    <div>
      <h1>{strings.templates.title}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
        <TemplateCreateForm onCreated={() => state.retry()} />
        <ExistingTemplates state={state} />
        <TemplateRenderForm templates={templates} />
      </div>
    </div>
  );
}

function TemplateCreateForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [allowedVariables, setAllowedVariables] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const cleanedVariables = allowedVariables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    try {
      await api.templates.create({
        key: key.trim(),
        subject,
        body,
        allowedVariables: cleanedVariables,
      });
      onCreated();
      setKey("");
      setSubject("");
      setBody("");
      setAllowedVariables("");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.templates.createHeading}</h2>
      <div className="field">
        <label htmlFor="template-key">{strings.templates.keyLabel}</label>
        <input id="template-key" type="text" required value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="template-subject">{strings.templates.subjectLabel}</label>
        <input id="template-subject" type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="template-body">{strings.templates.bodyLabel}</label>
        <textarea id="template-body" rows={4} required value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="template-allowed-variables">{strings.templates.allowedVariablesLabel}</label>
        <input
          id="template-allowed-variables"
          type="text"
          value={allowedVariables}
          onChange={(e) => setAllowedVariables(e.target.value)}
        />
        <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>{strings.templates.allowedVariablesHelp}</p>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={saving} style={{ marginTop: "var(--space-3)" }}>
        {saving ? strings.templates.creating : strings.templates.createButton}
      </button>
    </form>
  );
}

function ExistingTemplates({ state }: { state: RemoteState<{ definitions: TemplateDefinition[] }> & { retry: () => void } }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-3)" }}>{strings.templates.createdHeading}</h2>
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
            return <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{strings.templates.createdEmptyBody}</p>;
          case "success":
            return (
              <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {state.data.definitions.map((t) => (
                  <li key={t.id} className="card">
                    <p>
                      <strong>{t.key}</strong>
                    </p>
                    <p style={{ marginTop: "var(--space-2)", fontSize: "0.9rem" }}>{t.subject}</p>
                    {t.allowedVariables.length > 0 ? (
                      <p style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                        {strings.templates.variablesLabel}: {t.allowedVariables.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            );
        }
      })()}
    </div>
  );
}

interface VariablePair {
  name: string;
  value: string;
}

function TemplateRenderForm({ templates }: { templates: TemplateDefinition[] }) {
  const [key, setKey] = useState("");
  const [variablePairs, setVariablePairs] = useState<VariablePair[]>([{ name: "", value: "" }]);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);

  function updatePair(index: number, patch: Partial<VariablePair>) {
    setVariablePairs((pairs) => pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function handleSelectTemplate(selectedKey: string) {
    setKey(selectedKey);
    const match = templates.find((t) => t.key === selectedKey);
    if (match) {
      setVariablePairs(match.allowedVariables.length > 0 ? match.allowedVariables.map((name) => ({ name, value: "" })) : [{ name: "", value: "" }]);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setRendering(true);
    setError(null);
    setRendered(null);
    const variables: Record<string, string> = {};
    for (const pair of variablePairs) {
      const name = pair.name.trim();
      if (name) variables[name] = pair.value;
    }
    try {
      const { rendered: result } = await api.templates.render(key.trim(), variables);
      setRendered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setRendering(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-2)" }}>{strings.templates.renderHeading}</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginBottom: "var(--space-3)" }}>{strings.templates.renderHelp}</p>
      <div className="field">
        <label htmlFor="render-template-key">{strings.templates.renderKeyLabel}</label>
        {templates.length > 0 ? (
          <select id="render-template-key" required value={key} onChange={(e) => handleSelectTemplate(e.target.value)}>
            <option value="">{strings.templates.renderKeyPlaceholder}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.key}>
                {t.key}
              </option>
            ))}
          </select>
        ) : (
          <input id="render-template-key" type="text" required value={key} onChange={(e) => setKey(e.target.value)} />
        )}
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>
        {variablePairs.map((pair, i) => (
          <div key={i} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <input
              aria-label={strings.templates.variableNameLabel}
              type="text"
              placeholder={strings.templates.variableNameLabel}
              value={pair.name}
              onChange={(e) => updatePair(i, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <input
              aria-label={strings.templates.variableValueLabel}
              type="text"
              placeholder={strings.templates.variableValueLabel}
              value={pair.value}
              onChange={(e) => updatePair(i, { value: e.target.value })}
              style={{ flex: 1 }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => setVariablePairs((pairs) => [...pairs, { name: "", value: "" }])}
        >
          {strings.templates.addVariable}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={rendering} style={{ marginTop: "var(--space-3)" }}>
        {rendering ? strings.templates.rendering : strings.templates.renderButton}
      </button>
      {rendered ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <p>
            <strong>{strings.templates.renderedSubjectLabel}:</strong> {rendered.subject}
          </p>
          <p style={{ marginTop: "var(--space-2)", whiteSpace: "pre-wrap" }}>
            <strong>{strings.templates.renderedBodyLabel}:</strong> {rendered.body}
          </p>
        </div>
      ) : null}
    </form>
  );
}
