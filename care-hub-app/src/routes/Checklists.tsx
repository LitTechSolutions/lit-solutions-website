import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { CustomerChecklistAnswer, ChecklistItem } from "../api/types";
import { strings } from "../strings/en";
import { useApi } from "../hooks/useApi";
import { useMemberships } from "../hooks/useMemberships";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Customer-facing readiness checklist: answer/comment on your own
 * organization's customer-editable items, then "Submit for review."
 * Staff-only fields (internal notes, verification) never reach this
 * screen at all -- checklistStore.js's getChecklistForCustomer() never
 * returns them, so there's nothing here to accidentally leak.
 */
export function Checklists() {
  const membershipsState = useMemberships();

  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }

  const organizationId = membershipsState.data.memberships[0].organizationId;
  return <ChecklistsForOrg organizationId={organizationId} />;
}

function ChecklistsForOrg({ organizationId }: { organizationId: string }) {
  const fetchDefinitions = useCallback(() => api.checklists.list(organizationId), [organizationId]);
  const state = useApi(fetchDefinitions, [organizationId], (data) => data.definitions.length === 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      return <StateScreen title={strings.checklists.noChecklistTitle} body={strings.checklists.noChecklistBody} icon="—" />;
    case "success": {
      const definitions = state.data.definitions;
      const activeId = selectedId ?? definitions[0].id;
      return (
        <div>
          <h1>{strings.checklists.title}</h1>
          {definitions.length > 1 ? (
            <div className="field" style={{ maxWidth: 320, marginTop: "var(--space-4)" }}>
              <label htmlFor="checklist-picker">{strings.checklists.title}</label>
              <select id="checklist-picker" value={activeId} onChange={(e) => setSelectedId(e.target.value)}>
                {definitions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div style={{ marginTop: "var(--space-5)" }}>
            <ChecklistDetail organizationId={organizationId} checklistDefinitionId={activeId} />
          </div>
        </div>
      );
    }
  }
}

function ChecklistDetail({ organizationId, checklistDefinitionId }: { organizationId: string; checklistDefinitionId: string }) {
  const fetchChecklist = useCallback(() => api.checklists.getForCustomer(organizationId, checklistDefinitionId), [organizationId, checklistDefinitionId]);
  const state = useApi(fetchChecklist, [organizationId, checklistDefinitionId]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;
  if (state.status === "empty") return null; // never actually reached -- getForCustomer() always returns a definition+submission shape

  const { definition, answers, submission } = state.data;
  const canEdit = submission.status === "draft" || submission.status === "returned";
  const answerByKey = new Map(answers.map((a) => [a.itemKey, a]));

  async function handleSubmitForReview() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.checklists.submit(organizationId, checklistDefinitionId);
      state.retry();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <strong>{definition.title}</strong>
        <p style={{ marginTop: "var(--space-2)", color: "var(--ink-soft)" }}>
          {strings.checklists.statusLabels[submission.status]}
        </p>
        {submission.status === "returned" && submission.reviewNote ? (
          <p style={{ marginTop: "var(--space-2)" }}>
            <strong>{strings.checklists.returnedNoteLabel}:</strong> {submission.reviewNote}
          </p>
        ) : null}
        {submission.status === "submitted" ? <p style={{ marginTop: "var(--space-2)" }}>{strings.checklists.underReviewNotice}</p> : null}
        {submission.status === "verified" ? <p style={{ marginTop: "var(--space-2)" }}>{strings.checklists.reviewedByStaff}</p> : null}
      </div>

      <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {definition.items.map((item) => (
          <ChecklistItemRow
            key={item.key}
            item={item}
            answer={answerByKey.get(item.key)}
            canEdit={canEdit}
            organizationId={organizationId}
            checklistDefinitionId={checklistDefinitionId}
            onSaved={state.retry}
          />
        ))}
      </ul>

      {canEdit ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          {submitError ? (
            <p className="field-error" role="alert">
              {submitError}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmitForReview}>
            {submitting ? strings.checklists.submitting : strings.checklists.submitForReview}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChecklistItemRow({
  item,
  answer,
  canEdit,
  organizationId,
  checklistDefinitionId,
  onSaved,
}: {
  item: ChecklistItem;
  answer: CustomerChecklistAnswer | undefined;
  canEdit: boolean;
  organizationId: string;
  checklistDefinitionId: string;
  onSaved: () => void;
}) {
  const [met, setMet] = useState(answer?.met ?? false);
  const [comment, setComment] = useState(answer?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.checklists.answer(organizationId, checklistDefinitionId, item.key, met, comment || undefined);
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="card">
      <p>
        <strong>{item.label}</strong>
      </p>
      <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <input
            type="radio"
            name={`item-${item.key}`}
            checked={met === true}
            disabled={!canEdit}
            onChange={() => {
              setMet(true);
              setDirty(true);
            }}
          />
          {strings.checklists.metLabel}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <input
            type="radio"
            name={`item-${item.key}`}
            checked={met === false}
            disabled={!canEdit}
            onChange={() => {
              setMet(false);
              setDirty(true);
            }}
          />
          {strings.checklists.unmetLabel}
        </label>
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor={`comment-${item.key}`}>{strings.checklists.commentLabel}</label>
        <textarea
          id={`comment-${item.key}`}
          rows={2}
          disabled={!canEdit}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setDirty(true);
          }}
        />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: "var(--space-3)" }} disabled={saving || !dirty} onClick={handleSave}>
          {saving ? strings.checklists.saving : strings.checklists.saveAnswer}
        </button>
      ) : null}
    </li>
  );
}
