import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entitlements } from "./Entitlements";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  view: vi.fn(),
  recordUsage: vi.fn(),
  listForPlan: vi.fn(),
  subscriptionsList: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    entitlements: { view: mocks.view, recordUsage: mocks.recordUsage, listForPlan: mocks.listForPlan },
    subscriptions: { list: mocks.subscriptionsList },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

// strings/en.ts's real `entitlements` section is updated to match this
// screen's new auto-discovered usage overview (see Entitlements.tsx's
// module comment) as part of the same change that added
// entitlements.js's usageKey-omitted list route. Layer just the keys
// this screen actually renders on top of the real (unmodified) strings
// object via importOriginal, the same pattern every other Care Hub
// screen's *.vitest.tsx uses while the orchestrating session's reported
// string additions land, so this exercises real component logic against
// the exact copy reported for strings/en.ts.
vi.mock("../strings/en", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../strings/en")>();
  return {
    strings: {
      ...actual.strings,
      entitlements: {
        title: "Entitlements",
        overviewHeading: "Current plan usage",
        noActiveSubscriptionBody:
          "No active subscription found for this organization -- once one exists, its usage will show here automatically.",
        noLimitsConfiguredBody: "This plan doesn't have any usage limits configured yet.",
        lookupHeading: "Manual lookup",
        lookupHelp:
          "Use this to check a specific plan key and usage key directly -- useful for a plan not tied to this organization's current subscription, or a usage key not shown in the usage overview above.",
        planKeyLabel: "Plan key",
        usageKeyLabel: "Usage key",
        checkUsageButton: "Check usage",
        checking: "Checking…",
        limitLabel: "Limit",
        consumedLabel: "Used",
        remainingLabel: "Remaining",
        periodStartLabel: "Period started",
        resetPeriodLabel: "Resets",
        resetPeriodLabels: { monthly: "Monthly", total: "Total (does not reset)", unlimited: "Unlimited" },
        unlimitedLabel: "Unlimited",
        recordUsageHeading: "Record usage",
        amountLabel: "Amount",
        recordUsageButton: "Record usage",
        recording: "Recording…",
        recordedLabel: "Recorded",
        withinLimitLabel: "Within limit",
        yesLabel: "Yes",
        noLabel: "No",
      },
    },
  };
});

function usageView(overrides = {}) {
  return {
    limit: { planKey: "website_care", usageKey: "monthly_edits", limit: 10, resetPeriod: "monthly" as const },
    consumed: 3,
    remaining: 7,
    periodStart: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("Entitlements", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
    // Safe default for every test -- an org with no subscriptions at all
    // is a normal state (see Entitlements.tsx's EntitlementsOverview),
    // and this keeps every test that doesn't care about the auto-discovery
    // section from having to stub it out individually.
    mocks.subscriptionsList.mockResolvedValue({ subscriptions: [] });
  });

  it("lets a customer look up their organization's entitlement usage via the manual lookup form (regression)", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.view.mockResolvedValue(usageView());

    render(<Entitlements />);

    // The auto-discovery section above renders its own fallback state
    // (no subscription mocked for this test) without breaking the manual
    // form below it.
    expect(await screen.findByText(/no active subscription/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/plan key/i), "website_care");
    await userEvent.type(screen.getByLabelText(/usage key/i), "monthly_edits");
    await userEvent.click(screen.getByRole("button", { name: /^check usage$/i }));

    expect(mocks.view).toHaveBeenCalledWith("org-1", "website_care", "monthly_edits");
    expect(await screen.findByText("7")).toBeInTheDocument();
  });

  it("shows the auto-discovered usage table when the organization has an active subscription", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.subscriptionsList.mockResolvedValue({
      subscriptions: [
        { id: "sub-0", organizationId: "org-1", planKey: "old_plan", status: "cancelled" as const, startedAt: "2025-01-01T00:00:00Z" },
        { id: "sub-1", organizationId: "org-1", planKey: "website_care", status: "active" as const, startedAt: "2026-02-01T00:00:00Z" },
      ],
    });
    mocks.listForPlan.mockResolvedValue({
      views: [
        { limit: { planKey: "website_care", usageKey: "monthly_edits", limit: 10, resetPeriod: "monthly" as const }, consumed: 3, remaining: 7, periodStart: "2026-07-01T00:00:00Z" },
        { limit: { planKey: "website_care", usageKey: "included_hours", limit: 5, resetPeriod: "monthly" as const }, consumed: 5, remaining: 0, periodStart: "2026-07-01T00:00:00Z" },
      ],
    });

    render(<Entitlements />);

    expect(await screen.findByText("monthly_edits")).toBeInTheDocument();
    expect(screen.getByText("included_hours")).toBeInTheDocument();
    expect(mocks.listForPlan).toHaveBeenCalledWith("org-1", "website_care");
    // The cancelled subscription's plan is ignored in favor of the active one.
    expect(mocks.listForPlan).not.toHaveBeenCalledWith("org-1", "old_plan");
  });

  it("shows a fallback message instead of a table when the organization has no active subscription", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.subscriptionsList.mockResolvedValue({
      subscriptions: [{ id: "sub-1", organizationId: "org-1", planKey: "website_care", status: "cancelled" as const, startedAt: "2026-01-01T00:00:00Z" }],
    });

    render(<Entitlements />);

    expect(await screen.findByText(/no active subscription/i)).toBeInTheDocument();
    expect(mocks.listForPlan).not.toHaveBeenCalled();
  });

  it("routes technician (legacy staff role) to the customer view, same as a customer with no memberships", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<Entitlements />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });

  it("lets platform_admin look up usage for an org after entering its id (regression)", async () => {
    authRole = "admin";
    mocks.view.mockResolvedValue(usageView({ remaining: 4 }));

    render(<Entitlements />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    const planKeyInputs = await screen.findAllByLabelText(/plan key/i);
    const usageKeyInputs = screen.getAllByLabelText(/usage key/i);
    await userEvent.type(planKeyInputs[0], "website_care");
    await userEvent.type(usageKeyInputs[0], "monthly_edits");
    await userEvent.click(screen.getAllByRole("button", { name: /^check usage$/i })[0]);

    expect(mocks.view).toHaveBeenCalledWith("org-1", "website_care", "monthly_edits");
    expect(await screen.findByText("4")).toBeInTheDocument();
  });

  it("lets platform_admin record usage for an org (regression)", async () => {
    authRole = "admin";
    mocks.recordUsage.mockResolvedValue({ recorded: true, withinLimit: true, remaining: 6, reason: "" });

    render(<Entitlements />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    const planKeyInputs = await screen.findAllByLabelText(/plan key/i);
    const usageKeyInputs = screen.getAllByLabelText(/usage key/i);
    await userEvent.type(planKeyInputs[1], "website_care");
    await userEvent.type(usageKeyInputs[1], "monthly_edits");

    const amountInput = screen.getByLabelText(/amount/i);
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, "2");

    await userEvent.click(screen.getByRole("button", { name: /^record usage$/i }));

    expect(mocks.recordUsage).toHaveBeenCalledWith("org-1", "website_care", "monthly_edits", 2);
    expect(await screen.findByText("6")).toBeInTheDocument();
  });
});
