import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Approvals } from "./Approvals";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  approvalsList: vi.fn(),
  approvalsDecide: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: { approvals: { list: mocks.approvalsList, decide: mocks.approvalsDecide } },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function approval(overrides = {}) {
  return {
    id: "appr-1",
    organizationId: "org-1",
    subjectType: "change_order" as const,
    subjectId: "co-1",
    status: "pending" as const,
    requestedAt: "2026-02-01T00:00:00Z",
    requestedBy: "staff-1",
    expiresAt: "2026-02-08T00:00:00Z",
    ...overrides,
  };
}

describe("Approvals", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("does not show the approvals inbox to a technician account, and never calls the API", async () => {
    authRole = "staff";
    render(<Approvals />);
    expect(await screen.findByText(/not shown to staff accounts/i)).toBeInTheDocument();
    expect(mocks.approvalsList).not.toHaveBeenCalled();
  });

  it("lets a platform_admin look up and decide approvals for any organization by ID", async () => {
    authRole = "admin";
    mocks.approvalsList.mockResolvedValue({ approvals: [approval()] });

    render(<Approvals />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/change order/i)).toBeInTheDocument();
    expect(mocks.approvalsList).toHaveBeenCalledWith("org-1");
    expect(mocks.membershipsList).not.toHaveBeenCalled();
  });

  it("shows an unauthorized state for an org_member (approval.view is org_owner only)", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_member" as const, status: "active" }],
    });
    render(<Approvals />);
    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
    expect(mocks.approvalsList).not.toHaveBeenCalled();
  });

  it("shows the pending approvals inbox for an org_owner", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.approvalsList.mockResolvedValue({ approvals: [approval()] });

    render(<Approvals />);
    expect(await screen.findByText(/change order/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("shows an empty message when there's nothing pending", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.approvalsList.mockResolvedValue({ approvals: [] });

    render(<Approvals />);
    expect(await screen.findByText(/nothing waiting on your approval/i)).toBeInTheDocument();
  });

  it("approves a pending approval with an optional note", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.approvalsList.mockResolvedValue({ approvals: [approval()] });
    mocks.approvalsDecide.mockResolvedValue({ approval: approval({ status: "approved" as const }) });

    render(<Approvals />);
    await screen.findByText(/change order/i);

    await userEvent.type(screen.getByLabelText(/note \(optional\)/i), "Looks good");
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    expect(mocks.approvalsDecide).toHaveBeenCalledWith({
      approvalId: "appr-1",
      organizationId: "org-1",
      subjectType: "change_order",
      decisionAction: "approve",
      decisionNote: "Looks good",
    });
  });

  it("rejects a pending approval", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.approvalsList.mockResolvedValue({ approvals: [approval()] });
    mocks.approvalsDecide.mockResolvedValue({ approval: approval({ status: "rejected" as const }) });

    render(<Approvals />);
    await screen.findByText(/change order/i);
    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    expect(mocks.approvalsDecide).toHaveBeenCalledWith(expect.objectContaining({ approvalId: "appr-1", decisionAction: "reject" }));
  });
});
