import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTimeline } from "./ActivityTimeline";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  activityTimelineList: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    activityTimeline: { list: mocks.activityTimelineList },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

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

describe("ActivityTimeline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("tells staff accounts this screen isn't shown to them, without calling memberships/timeline", async () => {
    authRole = "staff";
    render(<ActivityTimeline />);
    expect(await screen.findByText(/not shown to staff accounts/i)).toBeInTheDocument();
    expect(mocks.membershipsList).not.toHaveBeenCalled();
    expect(mocks.activityTimelineList).not.toHaveBeenCalled();
  });

  it("also excludes platform_admin accounts", async () => {
    authRole = "admin";
    render(<ActivityTimeline />);
    expect(await screen.findByText(/not shown to staff accounts/i)).toBeInTheDocument();
  });

  it("shows a customer's timeline in reverse-chronological order", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.activityTimelineList.mockResolvedValue({
      timeline: [
        event({ id: "evt-1", summary: "Ticket submitted", occurredAt: "2026-01-01T00:00:00Z" }),
        event({ id: "evt-2", summary: "Scope of work sent", occurredAt: "2026-01-05T00:00:00Z" }),
      ],
    });

    render(<ActivityTimeline />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/scope of work sent/i);
    expect(items[1]).toHaveTextContent(/ticket submitted/i);
  });

  it("shows a no-activity message when the org has no timeline events", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.activityTimelineList.mockResolvedValue({ timeline: [] });

    render(<ActivityTimeline />);
    expect(await screen.findByText(/nothing has happened/i)).toBeInTheDocument();
  });

  it("shows a no-organization message when the customer has no memberships", async () => {
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<ActivityTimeline />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });
});
