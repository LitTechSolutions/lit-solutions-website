import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

const mocks = vi.hoisted(() => ({
  accountGet: vi.fn(),
  membershipsList: vi.fn(),
  activityTimelineList: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    account: { get: mocks.accountGet },
    activityTimeline: { list: mocks.activityTimelineList },
  },
}));
vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function account(overrides = {}) {
  return {
    user: {
      id: "cust-1",
      name: "Jamie Customer",
      email: "jamie@example.com",
      role: authRole,
      verified: true,
      preferences: { timezone: "", emailNotifications: true },
      ...overrides,
    },
  };
}

function event(overrides = {}) {
  return {
    id: "evt-1",
    organizationId: "org-1",
    sourceType: "ticket",
    sourceId: "t1",
    occurredAt: "2026-01-01T00:00:00Z",
    summary: "Ticket submitted",
    customerVisible: true as const,
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });
    mocks.activityTimelineList.mockResolvedValue({ timeline: [] });
  });

  it("shows a loading state before the account fetch resolves", () => {
    mocks.accountGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderDashboard();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error state with a retry button when the account fetch fails", async () => {
    mocks.accountGet.mockRejectedValue(new Error("Server exploded"));
    renderDashboard();
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("greets the signed-in user by name and email once the account fetch succeeds", async () => {
    mocks.accountGet.mockResolvedValue(account());
    renderDashboard();
    expect(await screen.findByRole("heading", { name: /welcome, jamie customer/i })).toBeInTheDocument();
    expect(screen.getByText(/jamie@example.com/i)).toBeInTheDocument();
  });

  it("shows only the welcome card for staff/admin accounts -- no shortcuts, activity, or payment card", async () => {
    authRole = "staff";
    mocks.accountGet.mockResolvedValue(account());
    renderDashboard();
    await screen.findByRole("heading", { name: /welcome/i });

    expect(screen.queryByText(/get things done/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/make a payment/i)).not.toBeInTheDocument();
    expect(mocks.membershipsList).not.toHaveBeenCalled();
  });

  it("gives a customer a shortcut grid linking to every simplified-nav destination", async () => {
    mocks.accountGet.mockResolvedValue(account());
    renderDashboard();
    await screen.findByRole("heading", { name: /welcome/i });

    expect(screen.getByRole("link", { name: /tickets/i })).toHaveAttribute("href", "/tickets");
    expect(screen.getByRole("link", { name: /readiness checklists/i })).toHaveAttribute("href", "/checklists");
    expect(screen.getByRole("link", { name: /^approvals/i })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("link", { name: /^project/i })).toHaveAttribute("href", "/project");
    expect(screen.getByRole("link", { name: /your website/i })).toHaveAttribute("href", "/your-website");
    expect(screen.getByRole("link", { name: /^billing/i })).toHaveAttribute("href", "/billing");
  });

  it("quietly omits the recent-activity card (rather than an error) when the account has no organization memberships", async () => {
    mocks.accountGet.mockResolvedValue(account());
    mocks.membershipsList.mockResolvedValue({ memberships: [] });
    renderDashboard();
    await screen.findByRole("heading", { name: /welcome/i });
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
    expect(mocks.activityTimelineList).not.toHaveBeenCalled();
  });

  it("shows a no-activity message (not a hidden card) once the org is resolved but has no events", async () => {
    mocks.accountGet.mockResolvedValue(account());
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.activityTimelineList.mockResolvedValue({ timeline: [] });
    renderDashboard();
    expect(await screen.findByText(/nothing has happened/i)).toBeInTheDocument();
  });

  it("shows the 3 most recent activity events in reverse-chronological order, with a link to the full timeline", async () => {
    mocks.accountGet.mockResolvedValue(account());
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.activityTimelineList.mockResolvedValue({
      timeline: [
        event({ id: "evt-1", summary: "Ticket submitted", occurredAt: "2026-01-01T00:00:00Z" }),
        event({ id: "evt-2", summary: "Scope of work sent", occurredAt: "2026-01-05T00:00:00Z" }),
        event({ id: "evt-3", summary: "Change order approved", occurredAt: "2026-01-03T00:00:00Z" }),
        event({ id: "evt-4", summary: "Checklist verified", occurredAt: "2026-01-08T00:00:00Z" }),
      ],
    });

    renderDashboard();
    await screen.findByText(/recent activity/i);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/checklist verified/i);
    expect(items[1]).toHaveTextContent(/scope of work sent/i);
    expect(items[2]).toHaveTextContent(/change order approved/i);
    expect(screen.queryByText(/ticket submitted/i)).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: /see all activity/i })).toHaveAttribute("href", "/activity-timeline");
  });

  it("keeps the existing payment terms gate: pay link is disabled until the terms checkbox is checked", async () => {
    mocks.accountGet.mockResolvedValue(account());
    renderDashboard();
    await screen.findByText(/make a payment/i);

    // While disabled this <a> has no href at all (see Dashboard.tsx), so it
    // has no implicit "link" role yet -- query by text instead of role
    // until the checkbox makes it a real link.
    const payLink = screen.getByText("Pay now").closest("a");
    expect(payLink).toHaveAttribute("aria-disabled", "true");
    expect(payLink).not.toHaveAttribute("href");

    await userEvent.click(payLink!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/please check the box/i);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    const enabledPayLink = screen.getByRole("link", { name: /pay now/i });
    expect(enabledPayLink).toHaveAttribute("aria-disabled", "false");
    expect(enabledPayLink).toHaveAttribute("href", expect.stringContaining("square.link"));
  });
});
