import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subscriptions } from "./Subscriptions";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsCreate: vi.fn(),
  subscriptionsTransition: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    subscriptions: { list: mocks.subscriptionsList, create: mocks.subscriptionsCreate, transition: mocks.subscriptionsTransition },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

// strings/en.ts doesn't have a `subscriptions` section yet -- this screen
// was built against the reported key set in the same session that will
// add it there for real (see this repo's build-out notes). Merge onto
// the real module's other sections (via importOriginal) rather than
// editing strings/en.ts directly, so this test is self-contained today
// and still exercises the real tickets/checklists/states strings every
// other screen already depends on.
vi.mock("../strings/en", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../strings/en")>();
  return {
    strings: {
      ...actual.strings,
      subscriptions: {
        title: "Subscriptions",
        emptyBody: "No subscriptions have been set up for this organization yet.",
        statusLabels: { active: "Active", paused: "Paused", cancelled: "Cancelled" },
        statusLabel: "Status",
        startedLabel: "Started",
        pausedLabel: "Paused",
        cancelledLabel: "Cancelled",
        transitionButton: "Update status",
        transitioning: "Updating…",
        newHeading: "Create a subscription",
        planKeyLabel: "Plan key",
        createButton: "Create subscription",
        creating: "Creating…",
      },
    },
  };
});

function subscription(overrides = {}) {
  return {
    id: "sub-1",
    organizationId: "org-1",
    planKey: "website_care",
    status: "active" as const,
    startedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Subscriptions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's subscriptions read-only, with no status control", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });

    render(<Subscriptions />);

    expect(await screen.findByText(/website_care/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create subscription/i })).not.toBeInTheDocument();
  });

  it("shows an empty message when the org has no subscriptions", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [] });

    render(<Subscriptions />);
    expect(await screen.findByText(/no subscriptions/i)).toBeInTheDocument();
  });

  it("routes technician (legacy staff role) to the customer view, same as a customer with no memberships", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<Subscriptions />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });

  it("lets platform_admin create a new subscription for an org", async () => {
    authRole = "admin";
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [] });
    mocks.subscriptionsCreate.mockResolvedValue({ subscription: subscription() });

    render(<Subscriptions />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no subscriptions/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/plan key/i), "website_care");
    await userEvent.click(screen.getByRole("button", { name: /^create subscription$/i }));

    expect(mocks.subscriptionsCreate).toHaveBeenCalledWith("org-1", "website_care");
  });

  it("lets platform_admin transition a subscription's status", async () => {
    authRole = "admin";
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });
    mocks.subscriptionsTransition.mockResolvedValue({ subscription: subscription({ status: "paused" as const }) });

    render(<Subscriptions />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/website_care/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/status/i), "paused");
    await userEvent.click(screen.getByRole("button", { name: /update status/i }));

    expect(mocks.subscriptionsTransition).toHaveBeenCalledWith("sub-1", "paused");
  });
});
