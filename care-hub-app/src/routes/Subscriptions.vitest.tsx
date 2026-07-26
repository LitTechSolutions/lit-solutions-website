import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subscriptions } from "./Subscriptions";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsCreate: vi.fn(),
  subscriptionsTransition: vi.fn(),
  squareList: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    subscriptions: { list: mocks.subscriptionsList, create: mocks.subscriptionsCreate, transition: mocks.subscriptionsTransition },
    squareSubscriptions: { list: mocks.squareList },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

// strings/en.ts DOES have a `subscriptions` section now (it didn't when this
// screen was first built, which is what the previous version of this comment
// described). The mock is kept only to pin the exact copy these assertions
// match on -- but it now spreads the real section first, so keys added later
// (e.g. the billing panel's) reach the component instead of being shadowed
// into undefined.
vi.mock("../strings/en", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../strings/en")>();
  return {
    strings: {
      ...actual.strings,
      subscriptions: {
        ...actual.strings.subscriptions,
        title: "Subscriptions",
        emptyBody: "No subscriptions have been set up for this organization yet.",
        statusLabels: { active: "Active", paused: "Paused", cancelled: "Cancelled" },
        transitionButton: "Update status",
        createButton: "Create subscription",
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


function squareLink(overrides = {}) {
  return {
    squareSubscriptionId: "sq-sub-1",
    squareStatus: "ACTIVE",
    mappedStatus: "active" as const,
    subscriptionId: "sub-1",
    lastEventAt: "2026-07-26T10:00:00Z",
    lastEventType: "subscription.updated",
    ...overrides,
  };
}

const ORG_MEMBERSHIP = {
  memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
};

describe("Subscriptions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
    // Square billing detail is supplementary; default it to "nothing linked"
    // so the existing assertions stay about the subscription itself.
    mocks.squareList.mockResolvedValue({ links: [] });
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

  it("tells a customer their billing is active with Square", async () => {
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });
    mocks.squareList.mockResolvedValue({ links: [squareLink()] });

    render(<Subscriptions />);
    expect(await screen.findByText(/billing is active with square/i)).toBeInTheDocument();
  });

  it("warns the customer when Square has paused billing -- the case they most need to see", async () => {
    // Our own record still says "active" until the webhook lands, so showing
    // only our status would tell someone everything is fine while Square has
    // already stopped taking payments.
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription({ status: "active" })] });
    mocks.squareList.mockResolvedValue({ links: [squareLink({ squareStatus: "DEACTIVATED", mappedStatus: "paused" })] });

    render(<Subscriptions />);
    expect(await screen.findByText(/square has paused billing/i)).toBeInTheDocument();
    // And it is surfaced as a disagreement rather than silently overwriting.
    expect(screen.getByText(/disagree/i)).toBeInTheDocument();
  });

  it("says so plainly when a subscription has no Square link at all", async () => {
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });
    mocks.squareList.mockResolvedValue({ links: [] });

    render(<Subscriptions />);
    expect(await screen.findByText(/not linked to a square subscription/i)).toBeInTheDocument();
  });

  it("reports an unrecognised Square status rather than hiding it", async () => {
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });
    mocks.squareList.mockResolvedValue({ links: [squareLink({ squareStatus: "SOMETHING_NEW", mappedStatus: null })] });

    render(<Subscriptions />);
    expect(await screen.findByText(/SOMETHING_NEW/)).toBeInTheDocument();
  });

  it("still renders the subscription when the Square lookup fails", async () => {
    // Billing detail is supplementary -- losing it must not blank the page.
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription()] });
    mocks.squareList.mockRejectedValue(new Error("square is down"));

    render(<Subscriptions />);
    expect(await screen.findByText(/website_care/i)).toBeInTheDocument();
    expect(await screen.findByText(/not linked to a square subscription/i)).toBeInTheDocument();
  });

  it("matches a link by providerSubscriptionReference when subscriptionId is absent", async () => {
    mocks.membershipsList.mockResolvedValue(ORG_MEMBERSHIP);
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [subscription({ providerSubscriptionReference: "sq-sub-9" })] });
    mocks.squareList.mockResolvedValue({ links: [squareLink({ squareSubscriptionId: "sq-sub-9", subscriptionId: undefined })] });

    render(<Subscriptions />);
    expect(await screen.findByText(/billing is active with square/i)).toBeInTheDocument();
  });
});
