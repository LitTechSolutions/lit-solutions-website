import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Subscription, SquareSubscriptionLink } from "../api/types";
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

const STATUSES: Subscription["status"][] = ["active", "paused", "cancelled"];

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

/**
 * Per care_hub_auth.js: subscriptions.js's create/transition actions both
 * go through authenticatePlatformAction(), which requires the legacy
 * session role to be literally "admin" -- technician (legacy "staff")
 * gets no special path and is flatly rejected. So this screen is a pure
 * read-only list for every customer role (list/view goes through
 * authenticateForOrg, which every customer role passes), and a
 * create/transition workflow for platform_admin only. Deliberately
 * isPlatformAdminRole, not isStaffRole (see Tickets.tsx/Checklists.tsx
 * for the same reasoning): routing technician in here would trade the
 * graceful "not built for you yet" message the membership-empty
 * CustomerSubscriptions path already shows them for a raw backend 403.
 */
export function Subscriptions() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);
  return isPlatformAdmin ? <StaffSubscriptions /> : <CustomerSubscriptions />;
}

function CustomerSubscriptions() {
  const membershipsState = useMemberships();
  if (membershipsState.status === "loading") return <Loading />;
  if (membershipsState.status === "expired") return <SignInAgain />;
  if (membershipsState.status === "unauthorized") return <UnauthorizedState />;
  if (membershipsState.status === "error") return <ErrorState body={membershipsState.message} onRetry={membershipsState.retry} />;
  if (membershipsState.status === "empty") {
    return <StateScreen title={strings.tickets.staffNotAvailableTitle} body={strings.tickets.staffNotAvailableBody} icon="…" />;
  }
  return <SubscriptionsForOrg organizationId={membershipsState.data.memberships[0].organizationId} readOnly />;
}

function StaffSubscriptions() {
  const [organizationId, setOrganizationId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  return (
    <div>
      <h1>{strings.subscriptions.title}</h1>
      <form
        className="card"
        style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", marginTop: "var(--space-4)", maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          setActiveOrgId(organizationId.trim() || null);
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="subscriptions-staff-org-id">{strings.checklists.staffOrgPickerLabel}</label>
          <input id="subscriptions-staff-org-id" type="text" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-small">
          {strings.checklists.staffLoadButton}
        </button>
      </form>
      {activeOrgId ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <SubscriptionsForOrg organizationId={activeOrgId} readOnly={false} />
        </div>
      ) : null}
    </div>
  );
}

function SubscriptionsForOrg({ organizationId, readOnly }: { organizationId: string; readOnly: boolean }) {
  // Fetch both sides together: our lifecycle record and Square's billing view
  // of it. A subscription whose payments have failed is "active" in our table
  // right up until the webhook lands, so showing only our status can tell a
  // customer everything is fine while Square has already stopped billing.
  // Square links are best-effort -- if that call fails the page still renders
  // the subscriptions, just without billing detail.
  const fetchSubscriptions = useCallback(
    () =>
      Promise.all([
        api.subscriptions.list(organizationId),
        // Wrapped rather than a bare .catch(): if the Square surface is
        // absent entirely the property access throws synchronously, which a
        // promise .catch() would never see, blanking the whole page over
        // optional detail.
        Promise.resolve()
          .then(() => api.squareSubscriptions.list(organizationId))
          .catch(() => ({ links: [] as SquareSubscriptionLink[] })),
      ]).then(([subs, square]) => ({ ...subs, squareLinks: square.links })),
    [organizationId]
  );
  const state = useApi(fetchSubscriptions, [organizationId], (data) => data.subscriptions.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const subscriptionsList = state.status === "success" ? state.data.subscriptions : [];
  const squareLinks = state.status === "success" ? state.data.squareLinks : [];
  const linkFor = (sub: Subscription) =>
    squareLinks.find((l) => l.subscriptionId === sub.id || (!!sub.providerSubscriptionReference && l.squareSubscriptionId === sub.providerSubscriptionReference));

  return (
    <div>
      {!readOnly ? null : <h1>{strings.subscriptions.title}</h1>}
      {subscriptionsList.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: readOnly ? "var(--space-4)" : 0 }}>
          {strings.subscriptions.emptyBody}
        </p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: readOnly ? "var(--space-4)" : 0 }}>
          {subscriptionsList.map((sub) =>
            readOnly ? (
              <SubscriptionCard key={sub.id} subscription={sub} squareLink={linkFor(sub)} />
            ) : (
              <StaffSubscriptionRow key={sub.id} subscription={sub} squareLink={linkFor(sub)} onUpdated={state.retry} />
            )
          )}
        </ul>
      )}
      {!readOnly ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <NewSubscriptionForm organizationId={organizationId} onCreated={state.retry} />
        </div>
      ) : null}
    </div>
  );
}


/**
 * Square's own view of the subscription. Deliberately shown as a separate
 * fact rather than merged into the status badge: they can legitimately
 * disagree for a short window (a webhook in flight), and quietly showing one
 * as if it were the other would hide exactly the situation a customer most
 * needs to know about -- billing stopped, service about to.
 */
function BillingPanel({ subscription, squareLink }: { subscription: Subscription; squareLink?: SquareSubscriptionLink }) {
  const s = strings.subscriptions;
  if (!squareLink) {
    return (
      <p style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginTop: "var(--space-2)" }}>{s.billingNone}</p>
    );
  }

  const message =
    squareLink.mappedStatus === "active"
      ? s.billingActive
      : squareLink.mappedStatus === "paused"
        ? s.billingPaused
        : squareLink.mappedStatus === "cancelled"
          ? s.billingCancelled
          : `${s.billingUnknown} ${squareLink.squareStatus}`;

  const disagrees = squareLink.mappedStatus !== null && squareLink.mappedStatus !== subscription.status;

  return (
    <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--line)" }}>
      <strong style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink-faint)" }}>
        {s.billingHeading}
      </strong>
      <p style={{ fontSize: "0.85rem", marginTop: "var(--space-2)" }}>{message}</p>
      {disagrees ? (
        <p role="status" style={{ fontSize: "0.82rem", marginTop: "var(--space-2)", color: "var(--accent-orange-text)" }}>
          {s.billingMismatch}
        </p>
      ) : null}
      {squareLink.lastEventAt ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.78rem", marginTop: "var(--space-2)" }}>
          {s.billingLastEvent} {new Date(squareLink.lastEventAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

function SubscriptionCard({ subscription, squareLink }: { subscription: Subscription; squareLink?: SquareSubscriptionLink }) {
  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong>{subscription.planKey}</strong>
        <span>{strings.subscriptions.statusLabels[subscription.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.subscriptions.startedLabel} {new Date(subscription.startedAt).toLocaleDateString()}
        {subscription.pausedAt ? (
          <>
            {" · "}
            {strings.subscriptions.pausedLabel} {new Date(subscription.pausedAt).toLocaleDateString()}
          </>
        ) : null}
        {subscription.cancelledAt ? (
          <>
            {" · "}
            {strings.subscriptions.cancelledLabel} {new Date(subscription.cancelledAt).toLocaleDateString()}
          </>
        ) : null}
      </p>
      <BillingPanel subscription={subscription} squareLink={squareLink} />
    </li>
  );
}

function StaffSubscriptionRow({ subscription, squareLink, onUpdated }: { subscription: Subscription; squareLink?: SquareSubscriptionLink; onUpdated: () => void }) {
  const [nextStatus, setNextStatus] = useState<Subscription["status"]>(subscription.status);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition() {
    setTransitioning(true);
    setError(null);
    try {
      await api.subscriptions.transition(subscription.id, nextStatus);
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
        <strong>{subscription.planKey}</strong>
        <span>{strings.subscriptions.statusLabels[subscription.status]}</span>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
        {strings.subscriptions.startedLabel} {new Date(subscription.startedAt).toLocaleDateString()}
        {subscription.pausedAt ? (
          <>
            {" · "}
            {strings.subscriptions.pausedLabel} {new Date(subscription.pausedAt).toLocaleDateString()}
          </>
        ) : null}
        {subscription.cancelledAt ? (
          <>
            {" · "}
            {strings.subscriptions.cancelledLabel} {new Date(subscription.cancelledAt).toLocaleDateString()}
          </>
        ) : null}
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-3)" }}>
        <label className="visually-hidden" htmlFor={`subscription-status-${subscription.id}`}>
          {strings.subscriptions.statusLabel}
        </label>
        <select
          id={`subscription-status-${subscription.id}`}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as Subscription["status"])}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {strings.subscriptions.statusLabels[s]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-small" disabled={transitioning || nextStatus === subscription.status} onClick={handleTransition}>
          {transitioning ? strings.subscriptions.transitioning : strings.subscriptions.transitionButton}
        </button>
      </div>
      <BillingPanel subscription={subscription} squareLink={squareLink} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function NewSubscriptionForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [planKey, setPlanKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.subscriptions.create(organizationId, planKey.trim());
      setPlanKey("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.states.errorBody);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.subscriptions.newHeading}</h2>
      <div className="field">
        <label htmlFor="subscription-plan-key">{strings.subscriptions.planKeyLabel}</label>
        <input id="subscription-plan-key" type="text" required value={planKey} onChange={(e) => setPlanKey(e.target.value)} />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-small" disabled={submitting}>
        {submitting ? strings.subscriptions.creating : strings.subscriptions.createButton}
      </button>
    </form>
  );
}
