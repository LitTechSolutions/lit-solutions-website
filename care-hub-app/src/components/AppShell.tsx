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
        <ul className="app-sidebar__nav">
          <li>
            <NavLink to="/" end className="app-sidebar__link">
              {strings.nav.dashboard}
            </NavLink>
          </li>
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
            <NavLink to="/account" className="app-sidebar__link">
              {strings.nav.account}
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className="app-main" id="main">
        {children}
      </main>
    </div>
  );
}
