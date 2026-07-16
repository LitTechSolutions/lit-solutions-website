import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItSupport } from "./ItSupport";

const mocks = vi.hoisted(() => ({
  ticketsList: vi.fn(),
  itSupportClassify: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    tickets: { list: mocks.ticketsList },
    itSupport: { classify: mocks.itSupportClassify },
  },
}));

let authRole: "customer" | "staff" | "admin" = "staff";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function ticket(overrides = {}) {
  return {
    id: "t1",
    organizationId: "org-1",
    category: "it_support",
    subject: "Printer won't connect",
    description: "Office printer offline",
    status: "assigned" as const,
    submittedAt: "2026-01-01T00:00:00Z",
    submittedBy: "u1",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    ...overrides,
  };
}

describe("ItSupport", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "staff";
  });

  it("tells customer accounts this screen isn't shown to them, without loading tickets", async () => {
    authRole = "customer";
    render(<ItSupport />);
    expect(await screen.findByText(/not shown to customer accounts/i)).toBeInTheDocument();
    expect(mocks.ticketsList).not.toHaveBeenCalled();
  });

  it("lets a technician pick a ticket and classify it", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.itSupportClassify.mockResolvedValue({
      classification: { ticketId: "t1", classification: "on_site" as const, reason: "Requires physical access to hardware." },
    });

    render(<ItSupport />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/printer won't connect/i)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/requires physical access/i));
    await userEvent.click(screen.getByRole("button", { name: /^classify$/i }));

    expect(mocks.itSupportClassify).toHaveBeenCalledWith({
      organizationId: "org-1",
      ticketId: "t1",
      requiresPhysicalAccess: true,
      safetyRisk: false,
    });
    expect(await screen.findByText(/on-site/i)).toBeInTheDocument();
    expect(screen.getByText(/requires physical access to hardware/i)).toBeInTheDocument();
  });

  it("lets platform_admin classify without being assigned", async () => {
    authRole = "admin";
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.itSupportClassify.mockResolvedValue({
      classification: { ticketId: "t1", classification: "remote" as const, reason: "No physical access needed." },
    });

    render(<ItSupport />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/printer won't connect/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^classify$/i }));

    expect(mocks.itSupportClassify).toHaveBeenCalledWith({
      organizationId: "org-1",
      ticketId: "t1",
      requiresPhysicalAccess: false,
      safetyRisk: false,
    });
    expect(await screen.findByText(/^remote$/i)).toBeInTheDocument();
  });

  it("shows a no-tickets message when the organization has none", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [] });
    render(<ItSupport />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(await screen.findByText(/tied to a ticket/i)).toBeInTheDocument();
  });

  it("surfaces a 403 from an unassigned technician as an inline error", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.itSupportClassify.mockRejectedValue(new Error("technician is not assigned to this resource"));

    render(<ItSupport />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(await screen.findByText(/printer won't connect/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^classify$/i }));
    expect(await screen.findByText(/not assigned to this resource/i)).toBeInTheDocument();
  });
});
