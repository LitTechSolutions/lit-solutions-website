import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceRecords } from "./ServiceRecords";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  recordsList: vi.fn(),
  recordsCreate: vi.fn(),
  recordsSetStatus: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    serviceRecords: { list: mocks.recordsList, create: mocks.recordsCreate, setStatus: mocks.recordsSetStatus },
  },
}));
// strings/en.ts doesn't have a `serviceRecords` section yet -- this file
// adds it (see this screen's final build report) but until that lands,
// the real module 404s on strings.serviceRecords.*. Merge onto the real
// module (via importActual) rather than replacing it outright, so every
// other section this screen legitimately reuses
// (tickets.staffNotAvailable*, checklists.staffOrgPickerLabel/
// staffLoadButton, states.errorBody) stays backed by the real copy
// instead of a hand-duplicated one that could drift from it.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    strings: {
      ...actual.strings,
      serviceRecords: {
        title: "Service Records",
        emptyTitle: "No service records yet",
        emptyBody: "Service records for this organization will show up here.",
        categoryLabel: "Category",
        categoryLabels: {
          website: "Website",
          it: "IT",
          security: "Security",
          recurring_service: "Recurring service",
        },
        statusLabel: "Status",
        statusLabels: {
          active: "Active",
          on_hold: "On hold",
          completed: "Completed",
          cancelled: "Cancelled",
        },
        createdLabel: "Created",
        newHeading: "Create a service record",
        titleFieldLabel: "Title",
        creating: "Creating…",
        createButton: "Create record",
        transitionButton: "Update status",
        transitioning: "Updating…",
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

function serviceRecord(overrides = {}) {
  return {
    id: "rec-1",
    organizationId: "org-1",
    category: "website" as const,
    title: "Homepage redesign",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "staff-1",
    version: 1,
    ...overrides,
  };
}

describe("ServiceRecords", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's service records read-only, with no status control", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.recordsList.mockResolvedValue({ records: [serviceRecord()] });

    render(<ServiceRecords />);

    expect(await screen.findByText(/homepage redesign/i)).toBeInTheDocument();
    expect(screen.getByText(/website/i)).toBeInTheDocument();
    expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /update status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create record/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when the organization has no service records", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.recordsList.mockResolvedValue({ records: [] });

    render(<ServiceRecords />);
    expect(await screen.findByText(/no service records yet/i)).toBeInTheDocument();
  });

  it("lets platform_admin staff create a service record", async () => {
    authRole = "admin";
    mocks.recordsList.mockResolvedValue({ records: [] });
    mocks.recordsCreate.mockResolvedValue({ record: serviceRecord() });

    render(<ServiceRecords />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no service records yet/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^category$/i), "security");
    await userEvent.type(screen.getByLabelText(/^title$/i), "Firewall audit");
    await userEvent.click(screen.getByRole("button", { name: /^create record$/i }));

    expect(mocks.recordsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", category: "security", title: "Firewall audit" })
    );
  });

  it("lets platform_admin staff transition a service record's status", async () => {
    authRole = "admin";
    mocks.recordsList.mockResolvedValue({ records: [serviceRecord()] });
    mocks.recordsSetStatus.mockResolvedValue({ record: serviceRecord({ status: "completed" }) });

    render(<ServiceRecords />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/homepage redesign/i)).toBeInTheDocument();

    const updateButton = screen.getByRole("button", { name: /update status/i });
    expect(updateButton).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/^status$/i), "completed");
    expect(updateButton).not.toBeDisabled();
    await userEvent.click(updateButton);

    expect(mocks.recordsSetStatus).toHaveBeenCalledWith("rec-1", "completed");
  });

  it("falls back to the graceful 'no organization' message for a technician account (not isStaffRole)", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<ServiceRecords />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });
});
