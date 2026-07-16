import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reminders } from "./Reminders";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  remindersList: vi.fn(),
  remindersCreate: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    reminders: { list: mocks.remindersList, create: mocks.remindersCreate },
  },
}));
// strings/en.ts doesn't have a `reminders` section yet -- this file adds
// it (see this screen's final build report) but until that lands, the
// real module 401s on strings.reminders.*. Merge onto the real module
// (via importActual) rather than replacing it outright, so every other
// section this screen legitimately reuses (tickets.staffNotAvailable*,
// checklists.staffOrgPickerLabel/staffLoadButton, states.errorBody) stays
// backed by the real copy instead of a hand-duplicated one that could
// drift from it.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    strings: {
      ...actual.strings,
      reminders: {
        title: "Reminders",
        emptyTitle: "No reminders yet",
        emptyBody: "There are no upcoming expirations to show for this organization.",
        expiresAtLabel: "Expires",
        sentBadge: "Sent",
        newHeading: "Create a reminder",
        subjectIdFieldLabel: "Subject",
        subjectIdFieldPlaceholder: "e.g. lit-solutions.tech, or an asset ID",
        subjectTypeFieldLabel: "Type",
        subjectTypeFieldPlaceholder: "e.g. domain, ssl, warranty, license, subscription",
        expiresAtFieldLabel: "Expires on",
        creating: "Creating…",
        createButton: "Create reminder",
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

function reminder(overrides = {}) {
  return {
    id: "rem-1",
    organizationId: "org-1",
    subjectId: "lit-solutions.tech",
    subjectType: "domain",
    expiresAt: "2026-08-01",
    sent: false,
    ...overrides,
  };
}

describe("Reminders", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's reminders read-only, sorted by expiration, with a sent badge when applicable", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.remindersList.mockResolvedValue({
      reminders: [
        reminder({ id: "rem-2", subjectId: "ssl-cert", subjectType: "ssl", expiresAt: "2026-09-01", sent: false }),
        reminder({ id: "rem-1", subjectId: "lit-solutions.tech", subjectType: "domain", expiresAt: "2026-08-01", sent: true }),
      ],
    });

    render(<Reminders />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Sorted by expiresAt ascending -- the domain reminder (Aug) comes before the ssl one (Sep).
    expect(items[0]).toHaveTextContent(/domain/i);
    expect(items[0]).toHaveTextContent(/lit-solutions\.tech/i);
    expect(items[1]).toHaveTextContent(/ssl/i);

    expect(screen.getByText(/^sent$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create reminder/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when the organization has no reminders", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.remindersList.mockResolvedValue({ reminders: [] });

    render(<Reminders />);
    expect(await screen.findByText(/no reminders yet/i)).toBeInTheDocument();
  });

  it("lets platform_admin staff create a reminder", async () => {
    authRole = "admin";
    mocks.remindersList.mockResolvedValue({ reminders: [] });
    mocks.remindersCreate.mockResolvedValue({ reminder: reminder() });

    render(<Reminders />);

    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no reminders yet/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^subject$/i), "lit-solutions.tech");
    await userEvent.type(screen.getByLabelText(/^type$/i), "domain");
    await userEvent.type(screen.getByLabelText(/expires on/i), "2026-08-01");
    await userEvent.click(screen.getByRole("button", { name: /^create reminder$/i }));

    expect(mocks.remindersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", subjectId: "lit-solutions.tech", subjectType: "domain" })
    );
  });

  it("falls back to the graceful 'no organization' message for a technician account (not isStaffRole)", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<Reminders />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });
});
