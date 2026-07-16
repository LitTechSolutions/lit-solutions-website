import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { strings } from "../strings/en";

export interface AppShellProps {
  children: ReactNode;
  userName?: string;
  onSignOut?: () => void | Promise<void>;
}

/**
 * Persistent topbar + sidebar frame around every authenticated route.
 * Landmarks (banner/navigation/main) and a skip link are set up here
 * once, so every route below just renders its content -- accessibility
 * structure isn't something each page has to remember to add. Only
 * rendered once RequireAuth confirms a real signed-in session -- /login,
 * /mfa/enroll, and /mfa/verify never see this frame.
 */
export function AppShell({ children, userName, onSignOut }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-topbar" role="banner">
        <span className="app-topbar__brand">
          {strings.app.brand} <strong>{strings.app.name}</strong>
        </span>
        <span className="app-topbar__actions">
          {userName ? <span className="app-topbar__user">{userName}</span> : null}
          {onSignOut ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={onSignOut}>
              {strings.nav.signOut}
            </button>
          ) : null}
        </span>
      </header>
      <nav className="app-sidebar" aria-label="Primary">
        <NavLink to="/" end className="app-sidebar__link">
          {strings.nav.dashboard}
        </NavLink>

        <div className="app-sidebar__group">
          <p className="app-sidebar__group-label">{strings.nav.groupWork}</p>
          <ul className="app-sidebar__nav">
            <li>
              <NavLink to="/tickets" className="app-sidebar__link">
                {strings.nav.tickets}
              </NavLink>
            </li>
            <li>
              <NavLink to="/checklists" className="app-sidebar__link">
                {strings.nav.checklists}
              </NavLink>
            </li>
            <li>
              <NavLink to="/scope-of-work" className="app-sidebar__link">
                {strings.nav.scopeOfWork}
              </NavLink>
            </li>
            <li>
              <NavLink to="/change-orders" className="app-sidebar__link">
                {strings.nav.changeOrders}
              </NavLink>
            </li>
            <li>
              <NavLink to="/approvals" className="app-sidebar__link">
                {strings.nav.approvals}
              </NavLink>
            </li>
            <li>
              <NavLink to="/work-log" className="app-sidebar__link">
                {strings.nav.workLog}
              </NavLink>
            </li>
            <li>
              <NavLink to="/it-support" className="app-sidebar__link">
                {strings.nav.itSupport}
              </NavLink>
            </li>
            <li>
              <NavLink to="/activity-timeline" className="app-sidebar__link">
                {strings.nav.activityTimeline}
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="app-sidebar__group">
          <p className="app-sidebar__group-label">{strings.nav.groupAccountBilling}</p>
          <ul className="app-sidebar__nav">
            <li>
              <NavLink to="/service-records" className="app-sidebar__link">
                {strings.nav.serviceRecords}
              </NavLink>
            </li>
            <li>
              <NavLink to="/website-profiles" className="app-sidebar__link">
                {strings.nav.websiteProfiles}
              </NavLink>
            </li>
            <li>
              <NavLink to="/subscriptions" className="app-sidebar__link">
                {strings.nav.subscriptions}
              </NavLink>
            </li>
            <li>
              <NavLink to="/technology-assets" className="app-sidebar__link">
                {strings.nav.technologyAssets}
              </NavLink>
            </li>
            <li>
              <NavLink to="/entitlements" className="app-sidebar__link">
                {strings.nav.entitlements}
              </NavLink>
            </li>
            <li>
              <NavLink to="/reminders" className="app-sidebar__link">
                {strings.nav.reminders}
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="app-sidebar__group">
          <p className="app-sidebar__group-label">{strings.nav.groupAdmin}</p>
          <ul className="app-sidebar__nav">
            <li>
              <NavLink to="/organizations" className="app-sidebar__link">
                {strings.nav.organizations}
              </NavLink>
            </li>
            <li>
              <NavLink to="/templates" className="app-sidebar__link">
                {strings.nav.templates}
              </NavLink>
            </li>
            <li>
              <NavLink to="/metrics" className="app-sidebar__link">
                {strings.nav.metrics}
              </NavLink>
            </li>
            <li>
              <NavLink to="/audit-log" className="app-sidebar__link">
                {strings.nav.auditLog}
              </NavLink>
            </li>
          </ul>
        </div>

        <NavLink to="/account" className="app-sidebar__link">
          {strings.nav.account}
        </NavLink>
      </nav>
      <main className="app-main" id="main">
        {children}
      </main>
    </div>
  );
}
