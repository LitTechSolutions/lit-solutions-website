import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { AuthenticatedUser } from "../api/types";
import type { RouteKey } from "../auth/navAccess";
import { canAccessRoute } from "../auth/navAccess";
import { strings } from "../strings/en";

export interface AppShellProps {
  children: ReactNode;
  userName?: string;
  role: AuthenticatedUser["role"];
  onSignOut?: () => void | Promise<void>;
}

interface NavItem {
  routeKey: RouteKey;
  path: string;
  label: string;
}

const WORK_ITEMS: NavItem[] = [
  { routeKey: "tickets", path: "/tickets", label: strings.nav.tickets },
  { routeKey: "checklists", path: "/checklists", label: strings.nav.checklists },
  { routeKey: "scopeOfWork", path: "/scope-of-work", label: strings.nav.scopeOfWork },
  { routeKey: "changeOrders", path: "/change-orders", label: strings.nav.changeOrders },
  { routeKey: "approvals", path: "/approvals", label: strings.nav.approvals },
  { routeKey: "workLog", path: "/work-log", label: strings.nav.workLog },
  { routeKey: "itSupport", path: "/it-support", label: strings.nav.itSupport },
  { routeKey: "activityTimeline", path: "/activity-timeline", label: strings.nav.activityTimeline },
];

const ACCOUNT_BILLING_ITEMS: NavItem[] = [
  { routeKey: "serviceRecords", path: "/service-records", label: strings.nav.serviceRecords },
  { routeKey: "websiteProfiles", path: "/website-profiles", label: strings.nav.websiteProfiles },
  { routeKey: "subscriptions", path: "/subscriptions", label: strings.nav.subscriptions },
  { routeKey: "technologyAssets", path: "/technology-assets", label: strings.nav.technologyAssets },
  { routeKey: "entitlements", path: "/entitlements", label: strings.nav.entitlements },
  { routeKey: "reminders", path: "/reminders", label: strings.nav.reminders },
];

const ADMIN_ITEMS: NavItem[] = [
  { routeKey: "organizations", path: "/organizations", label: strings.nav.organizations },
  { routeKey: "siteContent", path: "/site-content", label: strings.nav.siteContent },
  { routeKey: "imageLibrary", path: "/image-library", label: strings.nav.imageLibrary },
  { routeKey: "customerSupport", path: "/customer-support", label: strings.nav.customerSupport },
  { routeKey: "templates", path: "/templates", label: strings.nav.templates },
  { routeKey: "metrics", path: "/metrics", label: strings.nav.metrics },
  { routeKey: "auditLog", path: "/audit-log", label: strings.nav.auditLog },
];

// Customer nav is deliberately flat and short, not a filtered-down copy of
// the staff/admin groups above -- see navAccess.ts's header comment and
// [[project_care_hub_buildout_complete]]-adjacent design notes. Tickets/
// Checklists/Approvals are the things a customer actively does, kept as
// direct one-click links; everything else customers only ever read (site
// info, billing) is tucked behind three small hub pages instead of six
// more flat links, and Activity Timeline's feed lives on the Dashboard
// itself now rather than needing its own permanent nav slot.
const CUSTOMER_ITEMS: NavItem[] = [
  { routeKey: "tickets", path: "/tickets", label: strings.nav.tickets },
  { routeKey: "checklists", path: "/checklists", label: strings.nav.checklists },
  { routeKey: "approvals", path: "/approvals", label: strings.nav.approvals },
  { routeKey: "project", path: "/project", label: strings.nav.project },
  { routeKey: "yourWebsite", path: "/your-website", label: strings.nav.yourWebsite },
  { routeKey: "billing", path: "/billing", label: strings.nav.billing },
];

function filterItems(items: NavItem[], role: AuthenticatedUser["role"]): NavItem[] {
  return items.filter((item) => canAccessRoute(role, item.routeKey));
}

function NavList({ items }: { items: NavItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="app-sidebar__nav">
      {items.map((item) => (
        <li key={item.routeKey}>
          <NavLink to={item.path} className="app-sidebar__link">
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="app-sidebar__group">
      <p className="app-sidebar__group-label">{label}</p>
      <NavList items={items} />
    </div>
  );
}

// Every route in Work/Account & Billing/Admin has existed since the
// original 24-capability build-out -- this stays the flat, exhaustive
// layout platform_admin (and, minus the admin-only items, technician)
// already use in production. Filtering by role here (rather than
// hand-maintaining separate admin/staff lists) is what makes an
// always-dead link like Organizations disappear for a technician account
// without a second place to remember to update.
function StaffOrAdminNav({ role }: { role: AuthenticatedUser["role"] }) {
  return (
    <>
      <NavGroup label={strings.nav.groupWork} items={filterItems(WORK_ITEMS, role)} />
      <NavGroup label={strings.nav.groupAccountBilling} items={filterItems(ACCOUNT_BILLING_ITEMS, role)} />
      <NavGroup label={strings.nav.groupAdmin} items={filterItems(ADMIN_ITEMS, role)} />
    </>
  );
}

/**
 * Persistent topbar + sidebar frame around every authenticated route.
 * Landmarks (banner/navigation/main) and a skip link are set up here
 * once, so every route below just renders its content -- accessibility
 * structure isn't something each page has to remember to add. Only
 * rendered once RequireAuth confirms a real signed-in session -- /login,
 * /mfa/enroll, and /mfa/verify never see this frame.
 */
export function AppShell({ children, userName, role, onSignOut }: AppShellProps) {
  const isCustomer = role === "customer";

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

        {isCustomer ? <NavList items={CUSTOMER_ITEMS} /> : <StaffOrAdminNav role={role} />}

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
