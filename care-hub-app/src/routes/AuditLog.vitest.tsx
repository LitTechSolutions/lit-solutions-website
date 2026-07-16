import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLog } from "./AuditLog";

const mocks = vi.hoisted(() => ({
  auditLogQuery: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    auditLog: { query: mocks.auditLogQuery },
  },
}));

// See Templates.vitest.tsx's comment on this mock -- strings/en.ts's real
// `auditLog` section doesn't exist yet (the orchestrating session merges
// it in afterward), so layer the exact keys this screen renders on top
// of the real, unmodified strings object rather than editing that shared
// file directly.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    ...actual,
    strings: {
      ...actual.strings,
      auditLog: {
        title: "Audit Log",
        notPlatformAdminTitle: "Not available for this account",
        notPlatformAdminBody: "The audit log is only available to platform administrator accounts.",
        organizationIdLabel: "Organization ID",
        actorIdLabel: "Actor ID",
        actionLabel: "Action",
        dateFromLabel: "From",
        dateToLabel: "To",
        searchButton: "Search",
        searching: "Searching…",
        emptyBody: "No matching audit events.",
        occurredAtColumnLabel: "Occurred",
        actorColumnLabel: "Actor",
        actionColumnLabel: "Action",
        targetColumnLabel: "Target",
        organizationColumnLabel: "Organization",
        outcomeColumnLabel: "Outcome",
        actorTypeLabels: { user: "User", automated_service: "Automated service", system: "System" },
        outcomeLabels: { success: "Success", failure: "Failure", denied: "Denied" },
        loadMore: "Load more",
        loadingMore: "Loading…",
      },
    },
  };
});

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function auditEvent(overrides = {}) {
  return {
    id: "evt-1",
    correlationId: "corr-1",
    occurredAt: "2026-02-01T12:00:00Z",
    actorType: "user" as const,
    actorId: "u-9",
    actorRole: "org_owner",
    organizationId: "org-1",
    action: "ticket.create",
    targetType: "ticket",
    targetId: "t-1",
    outcome: "success" as const,
    ...overrides,
  };
}

describe("AuditLog", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("does not show the audit log to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<AuditLog />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.auditLogQuery).not.toHaveBeenCalled();
  });

  it("also excludes technician (staff) accounts, not just customers", async () => {
    authRole = "staff";
    render(<AuditLog />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.auditLogQuery).not.toHaveBeenCalled();
  });

  it("searches with only the non-empty filters, and renders matching events", async () => {
    authRole = "admin";
    mocks.auditLogQuery.mockResolvedValue({ events: [auditEvent()], nextCursor: null });

    render(<AuditLog />);

    await userEvent.type(screen.getByLabelText(/actor id/i), "u-9");
    await userEvent.type(screen.getByLabelText(/^action$/i), "ticket.create");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(mocks.auditLogQuery).toHaveBeenCalledWith({ actorId: "u-9", action: "ticket.create" });
    expect(await screen.findByText(/ticket\.create/i)).toBeInTheDocument();
    expect(screen.getByText(/org_owner/i)).toBeInTheDocument();
    expect(screen.getByText(/^success$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows a Load more button when nextCursor is non-null, and appends the next page on click", async () => {
    authRole = "admin";
    mocks.auditLogQuery.mockResolvedValueOnce({
      events: [auditEvent({ id: "evt-1", action: "ticket.create" })],
      nextCursor: "cursor-1",
    });

    render(<AuditLog />);
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/ticket\.create/i)).toBeInTheDocument();
    const loadMoreButton = screen.getByRole("button", { name: /load more/i });

    mocks.auditLogQuery.mockResolvedValueOnce({
      events: [auditEvent({ id: "evt-2", action: "ticket.transition" })],
      nextCursor: null,
    });
    await userEvent.click(loadMoreButton);

    expect(mocks.auditLogQuery).toHaveBeenLastCalledWith({ cursor: "cursor-1" });
    expect(await screen.findByText(/ticket\.transition/i)).toBeInTheDocument();
    // Both pages' events remain visible, and the button disappears once nextCursor is null.
    expect(screen.getByText(/ticket\.create/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows an inline error if the search fails", async () => {
    authRole = "admin";
    mocks.auditLogQuery.mockRejectedValue(new Error("Boom"));

    render(<AuditLog />);
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });

  it("shows an empty message when there are no matching events", async () => {
    authRole = "admin";
    mocks.auditLogQuery.mockResolvedValue({ events: [], nextCursor: null });

    render(<AuditLog />);
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no matching audit events/i)).toBeInTheDocument();
  });
});
