import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Organizations } from "./Organizations";

const mocks = vi.hoisted(() => ({
  organizationsCreate: vi.fn(),
  organizationsGet: vi.fn(),
  organizationsSetStatus: vi.fn(),
  invitationsCreate: vi.fn(),
  invitationsList: vi.fn(),
  invitationsRevoke: vi.fn(),
  invitationsResend: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    organizations: {
      create: mocks.organizationsCreate,
      get: mocks.organizationsGet,
      setStatus: mocks.organizationsSetStatus,
    },
    invitations: {
      create: mocks.invitationsCreate,
      list: mocks.invitationsList,
      revoke: mocks.invitationsRevoke,
      resend: mocks.invitationsResend,
    },
  },
}));

let authRole: "customer" | "staff" | "admin" = "admin";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function organization(overrides = {}) {
  return {
    id: "org-1",
    name: "Acme Co",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "admin-1",
    version: 1,
    ...overrides,
  };
}

function invitation(overrides = {}) {
  return {
    id: "invite-1",
    organizationId: "org-1",
    email: "owner@example.com",
    role: "org_owner" as const,
    status: "pending" as const,
    invitedBy: "admin-1",
    createdAt: "2026-01-02T00:00:00Z",
    expiresAt: "2026-01-09T00:00:00Z",
    resendCount: 0,
    ...overrides,
  };
}

describe("Organizations", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "admin";
  });

  it("does not show organization management to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<Organizations />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(mocks.organizationsCreate).not.toHaveBeenCalled();
    expect(mocks.organizationsGet).not.toHaveBeenCalled();
    expect(mocks.invitationsList).not.toHaveBeenCalled();
  });

  it("does not show organization management to technician (staff) accounts either", async () => {
    authRole = "staff";
    render(<Organizations />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(mocks.organizationsGet).not.toHaveBeenCalled();
    expect(mocks.invitationsList).not.toHaveBeenCalled();
  });

  it("creates a new organization and shows its details plus an empty invitations section", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [] });

    render(<Organizations />);

    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    expect(mocks.organizationsCreate).toHaveBeenCalledWith({ name: "Acme Co" });
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText(/org-1/)).toBeInTheDocument();
    expect(await screen.findByText(/no invitations sent yet/i)).toBeInTheDocument();
  });

  it("looks up an existing organization by ID and shows its invitations", async () => {
    mocks.organizationsGet.mockResolvedValue({ organization: organization({ id: "org-2", name: "Beta LLC" }) });
    mocks.invitationsList.mockResolvedValue({ invitations: [invitation({ organizationId: "org-2" })] });

    render(<Organizations />);

    await userEvent.type(screen.getByLabelText(/organization id/i), "org-2");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(mocks.organizationsGet).toHaveBeenCalledWith("org-2");
    expect(await screen.findByText("Beta LLC")).toBeInTheDocument();
    expect(await screen.findByText(/owner@example.com/i)).toBeInTheDocument();
  });

  it("changes an organization's status", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [] });
    mocks.organizationsSetStatus.mockResolvedValue({ organization: organization({ status: "suspended" as const }) });

    render(<Organizations />);
    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();

    const statusSelect = screen.getByLabelText(/^status$/i);
    await userEvent.selectOptions(statusSelect, "suspended");
    await userEvent.click(screen.getByRole("button", { name: /^update status$/i }));

    expect(mocks.organizationsSetStatus).toHaveBeenCalledWith("org-1", "suspended");
  });

  it("does not let staff submit a status update when the selection hasn't changed", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [] });

    render(<Organizations />);
    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^update status$/i })).toBeDisabled();
    expect(mocks.organizationsSetStatus).not.toHaveBeenCalled();
  });

  it("sends an invitation with the selected role", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [] });
    mocks.invitationsCreate.mockResolvedValue({ invitation: invitation() });

    render(<Organizations />);
    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));
    await screen.findByText(/no invitations sent yet/i);

    await userEvent.type(screen.getByLabelText(/^email$/i), "owner@example.com");
    await userEvent.selectOptions(screen.getByLabelText(/^role$/i), "org_owner");
    await userEvent.click(screen.getByRole("button", { name: /^send invitation$/i }));

    expect(mocks.invitationsCreate).toHaveBeenCalledWith({ organizationId: "org-1", email: "owner@example.com", role: "org_owner" });
  });

  it("revokes and resends a pending invitation", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [invitation()] });
    mocks.invitationsResend.mockResolvedValue({ invitation: invitation({ resendCount: 1 }) });
    mocks.invitationsRevoke.mockResolvedValue({ invitation: invitation({ status: "revoked" as const }) });

    render(<Organizations />);
    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    await screen.findByText(/owner@example.com/i);
    await userEvent.click(screen.getByRole("button", { name: /^resend$/i }));
    expect(mocks.invitationsResend).toHaveBeenCalledWith("invite-1");

    await userEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
    expect(mocks.invitationsRevoke).toHaveBeenCalledWith("invite-1");
  });

  it("does not show revoke/resend actions for an invitation that's no longer pending", async () => {
    mocks.organizationsCreate.mockResolvedValue({ organization: organization() });
    mocks.invitationsList.mockResolvedValue({ invitations: [invitation({ status: "accepted" as const })] });

    render(<Organizations />);
    await userEvent.type(screen.getByLabelText(/organization name/i), "Acme Co");
    await userEvent.click(screen.getByRole("button", { name: /^create organization$/i }));

    await screen.findByText(/owner@example.com/i);
    expect(screen.queryByRole("button", { name: /^resend$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^revoke$/i })).not.toBeInTheDocument();
  });
});
