import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopeOfWork } from "./ScopeOfWork";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  ticketsList: vi.fn(),
  scopeList: vi.fn(),
  scopeCreate: vi.fn(),
  scopeCreateNextVersion: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    tickets: { list: mocks.ticketsList },
    scopeOfWork: { list: mocks.scopeList, create: mocks.scopeCreate, createNextVersion: mocks.scopeCreateNextVersion },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

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
    assumptions: ["Client provides copy"],
    exclusions: ["Hosting not included"],
    lineItems: [{ description: "Homepage redesign", quantity: 1, priceRef: "PKG-1" }],
    createdAt: "2026-01-02T00:00:00Z",
    createdBy: "staff-1",
    ...overrides,
  };
}

describe("ScopeOfWork", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's scope of work read-only, with no editor", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.scopeList.mockResolvedValue({ scopes: [scope()] });

    render(<ScopeOfWork />);

    expect(await screen.findByText(/homepage redesign/i)).toBeInTheDocument();
    expect(screen.getByText(/version 1/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create scope/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^description$/i)).not.toBeInTheDocument();
  });

  it("shows a no-tickets message when the customer's org has no tickets", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.ticketsList.mockResolvedValue({ tickets: [] });

    render(<ScopeOfWork />);
    expect(await screen.findByText(/no tickets yet/i)).toBeInTheDocument();
  });

  it("lets platform_admin staff draft the initial scope for a ticket with none yet", async () => {
    authRole = "admin";
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.scopeList.mockResolvedValue({ scopes: [] });
    mocks.scopeCreate.mockResolvedValue({ scope: scope() });

    render(<ScopeOfWork />);

    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/draft the initial scope/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^description$/i), "Homepage redesign");
    await userEvent.click(screen.getByRole("button", { name: /^create scope$/i }));

    expect(mocks.scopeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        ticketId: "t1",
        lineItems: [expect.objectContaining({ description: "Homepage redesign" })],
      })
    );
  });

  it("lets technician staff save a new version when a current scope already exists", async () => {
    authRole = "staff";
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.scopeList.mockResolvedValue({ scopes: [scope()] });
    mocks.scopeCreateNextVersion.mockResolvedValue({ scope: scope({ version: 2 }) });

    render(<ScopeOfWork />);

    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/create a new version/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save new version/i }));

    expect(mocks.scopeCreateNextVersion).toHaveBeenCalledWith(expect.objectContaining({ scopeId: "scope-1", organizationId: "org-1" }));
  });
});
