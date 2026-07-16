import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteProfiles } from "./WebsiteProfiles";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  profilesList: vi.fn(),
  profilesCreate: vi.fn(),
  profilesUpdate: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    websiteProfiles: { list: mocks.profilesList, create: mocks.profilesCreate, update: mocks.profilesUpdate },
  },
}));
// strings/en.ts's real `websiteProfiles` section is being extended in the
// same round as this screen (editButton/saveButton/cancelButton/saving
// added for the new inline edit control) -- this mock reflects that
// target copy so this file is self-contained today. Merge onto the real
// module (via importActual) rather than replacing it outright, so every
// other section this screen legitimately reuses (tickets.staffNotAvailable*,
// checklists.staffOrgPickerLabel/staffLoadButton, states.errorBody) stays
// backed by the real copy instead of a hand-duplicated one that could
// drift from it.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    strings: {
      ...actual.strings,
      websiteProfiles: {
        title: "Website Profiles",
        emptyTitle: "No website profiles yet",
        emptyBody: "Website profiles for this organization will show up here.",
        domainRegistrarLabel: "Domain registrar",
        hostingProviderLabel: "Hosting provider",
        newHeading: "Create a website profile",
        primaryUrlFieldLabel: "Website URL",
        domainRegistrarFieldLabel: "Domain registrar (optional)",
        hostingProviderFieldLabel: "Hosting provider (optional)",
        creating: "Creating…",
        createButton: "Create profile",
        editButton: "Edit",
        saveButton: "Save",
        cancelButton: "Cancel",
        saving: "Saving…",
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

function websiteProfile(overrides = {}) {
  return {
    id: "profile-1",
    organizationId: "org-1",
    primaryUrl: "https://example.com",
    domainRegistrar: "GoDaddy",
    hostingProvider: "Netlify",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("WebsiteProfiles", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's website profiles read-only, with the URL as a real link and optional fields shown only when present", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.profilesList.mockResolvedValue({
      profiles: [
        websiteProfile(),
        websiteProfile({ id: "profile-2", primaryUrl: "https://second.example.com", domainRegistrar: undefined, hostingProvider: undefined }),
      ],
    });

    render(<WebsiteProfiles />);

    const link = await screen.findByRole("link", { name: "https://example.com" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(screen.getByText(/godaddy/i)).toBeInTheDocument();
    expect(screen.getByText(/netlify/i)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "https://second.example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when the organization has no website profiles", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.profilesList.mockResolvedValue({ profiles: [] });

    render(<WebsiteProfiles />);
    expect(await screen.findByText(/no website profiles yet/i)).toBeInTheDocument();
  });

  it("lets platform_admin staff create a website profile", async () => {
    authRole = "admin";
    mocks.profilesList.mockResolvedValue({ profiles: [] });
    mocks.profilesCreate.mockResolvedValue({ profile: websiteProfile() });

    render(<WebsiteProfiles />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no website profiles yet/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/website url/i), "https://newsite.example.com");
    await userEvent.type(screen.getByLabelText(/domain registrar/i), "Namecheap");
    await userEvent.type(screen.getByLabelText(/hosting provider/i), "Vercel");
    await userEvent.click(screen.getByRole("button", { name: /^create profile$/i }));

    expect(mocks.profilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        primaryUrl: "https://newsite.example.com",
        domainRegistrar: "Namecheap",
        hostingProvider: "Vercel",
      })
    );
  });

  it("falls back to the graceful 'no organization' message for a technician account (not isStaffRole)", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<WebsiteProfiles />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });

  it("lets platform_admin edit a website profile and refetches the list", async () => {
    authRole = "admin";
    mocks.profilesList
      .mockResolvedValueOnce({ profiles: [websiteProfile()] })
      .mockResolvedValueOnce({ profiles: [websiteProfile({ primaryUrl: "https://updated.example.com", domainRegistrar: "Namecheap" })] });
    mocks.profilesUpdate.mockResolvedValue({ profile: websiteProfile({ primaryUrl: "https://updated.example.com", domainRegistrar: "Namecheap" }) });

    render(<WebsiteProfiles />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    const card = (await screen.findByRole("link", { name: "https://example.com" })).closest("li") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: /^edit$/i }));

    // Scoped to the card: the always-visible "create profile" form below
    // renders a field with this same label, so an unscoped query would be
    // ambiguous once the edit form is showing alongside it.
    const urlInput = within(card).getByLabelText(/website url/i);
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://updated.example.com");
    const registrarInput = within(card).getByLabelText(/domain registrar/i);
    await userEvent.clear(registrarInput);
    await userEvent.type(registrarInput, "Namecheap");

    await userEvent.click(within(card).getByRole("button", { name: /^save$/i }));

    expect(mocks.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-1", primaryUrl: "https://updated.example.com", domainRegistrar: "Namecheap" })
    );
    // Refetched from the server (not merged locally from the PATCH response).
    expect(mocks.profilesList).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("link", { name: "https://updated.example.com" })).toBeInTheDocument();
  });

  it("discards changes without calling the update API when cancel is clicked", async () => {
    authRole = "admin";
    mocks.profilesList.mockResolvedValue({ profiles: [websiteProfile()] });

    render(<WebsiteProfiles />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    const card = (await screen.findByRole("link", { name: "https://example.com" })).closest("li") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: /^edit$/i }));

    const urlInput = within(card).getByLabelText(/website url/i);
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://discarded.example.com");

    await userEvent.click(within(card).getByRole("button", { name: /^cancel$/i }));

    expect(mocks.profilesUpdate).not.toHaveBeenCalled();
    // Only the initial fetch happened -- cancel never refetches either.
    expect(mocks.profilesList).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("link", { name: "https://example.com" })).toBeInTheDocument();
  });
});
