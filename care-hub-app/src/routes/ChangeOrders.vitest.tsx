import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeOrders } from "./ChangeOrders";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  ticketsList: vi.fn(),
  scopeList: vi.fn(),
  changeOrdersList: vi.fn(),
  changeOrdersCreate: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    tickets: { list: mocks.ticketsList },
    scopeOfWork: { list: mocks.scopeList },
    changeOrders: { list: mocks.changeOrdersList, create: mocks.changeOrdersCreate },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function changeOrder(overrides = {}) {
  return {
    id: "co-1",
    organizationId: "org-1",
    originalScopeId: "scope-1",
    description: "Add contact form",
    addedLineItems: [{ description: "Contact form", quantity: 1, priceRef: "ADD-1" }],
    createdAt: "2026-02-01T00:00:00Z",
    createdBy: "staff-1",
    ...overrides,
  };
}

function ticket(overrides = {}) {
  return {
    id: "t1",
    organizationId: "org-1",
    category: "website_change",
    subject: "Redesign homepage",
    description: "Refresh the homepage layout",
    status: "in_progress" as const,
    submittedAt: "2026-01-01T00:00:00Z",
    submittedBy: "u1",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    ...overrides,
  };
}

function scope(overrides = {}) {
  return {
    id: "scope-1",
    organizationId: "org-1",
    ticketId: "t1",
    version: 1,
    status: "sent" as const,
    assumptions: [] as string[],
    exclusions: [] as string[],
    lineItems: [{ description: "Homepage redesign", quantity: 1, priceRef: "PKG-1" }],
    createdAt: "2026-01-02T00:00:00Z",
    createdBy: "staff-1",
    ...overrides,
  };
}

describe("ChangeOrders", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's change orders read-only, with a hint pointing to Approvals", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.changeOrdersList.mockResolvedValue({ changeOrders: [changeOrder()] });

    render(<ChangeOrders />);

    expect(await screen.findByText(/add contact form/i)).toBeInTheDocument();
    expect(screen.getByText(/approved or rejected by your organization's owner/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create change order/i })).not.toBeInTheDocument();
  });

  it("shows an empty message when the org has no change orders", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.changeOrdersList.mockResolvedValue({ changeOrders: [] });

    render(<ChangeOrders />);
    expect(await screen.findByText(/change orders show up here/i)).toBeInTheDocument();
  });

  it("tells staff there's no current scope to attach a change order to yet", async () => {
    authRole = "admin";
    mocks.changeOrdersList.mockResolvedValue({ changeOrders: [] });
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.scopeList.mockResolvedValue({ scopes: [] });

    render(<ChangeOrders />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/doesn't have a current scope of work/i)).toBeInTheDocument();
  });

  it("lets staff create a change order against a ticket's current scope", async () => {
    authRole = "staff";
    mocks.changeOrdersList.mockResolvedValue({ changeOrders: [] });
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.scopeList.mockResolvedValue({ scopes: [scope()] });
    mocks.changeOrdersCreate.mockResolvedValue({
      changeOrder: changeOrder(),
      approval: {
        id: "appr-1",
        organizationId: "org-1",
        subjectType: "change_order" as const,
        subjectId: "co-1",
        status: "pending" as const,
        requestedAt: "2026-02-01T00:00:00Z",
        requestedBy: "staff-1",
        expiresAt: "2026-02-08T00:00:00Z",
      },
    });

    render(<ChangeOrders />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/against scope version 1/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/what's changing/i), "Add contact form");
    await userEvent.type(screen.getByLabelText(/^description$/i), "Contact form");
    await userEvent.click(screen.getByRole("button", { name: /^create change order$/i }));

    expect(mocks.changeOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", originalScopeId: "scope-1", description: "Add contact form" })
    );
  });
});
