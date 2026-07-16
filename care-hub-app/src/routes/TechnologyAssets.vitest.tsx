import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TechnologyAssets } from "./TechnologyAssets";

const mocks = vi.hoisted(() => ({
  membershipsList: vi.fn(),
  assetsList: vi.fn(),
  createAsset: vi.fn(),
  recordBackup: vi.fn(),
  verifyBackup: vi.fn(),
}));

vi.mock("../api/memberships", () => ({
  memberships: { list: mocks.membershipsList },
}));
vi.mock("../api/client", () => ({
  api: {
    technologyAssets: {
      list: mocks.assetsList,
      createAsset: mocks.createAsset,
      recordBackup: mocks.recordBackup,
      verifyBackup: mocks.verifyBackup,
    },
  },
}));

let authRole: "customer" | "staff" | "admin" = "customer";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

// strings/en.ts's real `technologyAssets` section is being updated in the
// same round as this screen (backupsHeading's copy no longer says "this
// session", and backupsSessionNotice is retired now that backups are a
// real, persisted, refetchable list) -- this mock reflects that target
// copy so this file is self-contained today. Merge onto the real module's
// other sections (via importOriginal) rather than editing strings/en.ts
// directly, so this test still exercises the real tickets/checklists/
// states strings every other screen depends on.
vi.mock("../strings/en", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../strings/en")>();
  return {
    strings: {
      ...actual.strings,
      technologyAssets: {
        title: "Technology Assets",
        emptyBody: "No technology assets have been recorded for this organization yet.",
        warrantyLabel: "Warranty expires",
        licenseLabel: "License expires",
        newAssetHeading: "Add a technology asset",
        typeLabel: "Type",
        labelLabel: "Label",
        warrantyFieldLabel: "Warranty expires (optional)",
        licenseFieldLabel: "License expires (optional)",
        createAssetButton: "Add asset",
        creatingAsset: "Adding…",
        backupsHeading: "Backups",
        websiteProfileIdLabel: "Website profile ID",
        categoryLabel: "Category",
        categoryLabels: {
          source: "Source",
          content: "Content",
          assets: "Assets",
          database: "Database",
          configuration: "Configuration",
        },
        locationLabel: "Location",
        recordBackupButton: "Record backup",
        recordingBackup: "Recording…",
        takenAtLabel: "Taken",
        restoreVerifiedLabel: "Restore verified",
        restoreNotVerifiedLabel: "Restore not yet verified",
        verifyBackupButton: "Mark restore-verified",
        verifyingBackup: "Verifying…",
      },
    },
  };
});

function asset(overrides = {}) {
  return {
    id: "asset-1",
    organizationId: "org-1",
    type: "laptop",
    label: "Front desk laptop",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function backup(overrides = {}) {
  return {
    id: "backup-1",
    organizationId: "org-1",
    websiteProfileId: "profile-1",
    category: "source" as const,
    location: "s3://backups/org-1/source-2026-01-01.tar.gz",
    takenAt: "2026-01-01T00:00:00Z",
    restoreVerified: false,
    ...overrides,
  };
}

describe("TechnologyAssets", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("shows a customer's technology assets read-only, with no staff forms", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.assetsList.mockResolvedValue({ assets: [asset({ warrantyExpiresAt: "2027-01-01T00:00:00Z" })], backups: [] });

    render(<TechnologyAssets />);

    expect(await screen.findByText(/front desk laptop/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add asset$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record backup/i })).not.toBeInTheDocument();
  });

  it("shows an empty message when the org has no technology assets", async () => {
    mocks.membershipsList.mockResolvedValue({
      memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner" as const, status: "active" }],
    });
    mocks.assetsList.mockResolvedValue({ assets: [], backups: [] });

    render(<TechnologyAssets />);
    expect(await screen.findByText(/no technology assets/i)).toBeInTheDocument();
  });

  it("routes technician (legacy staff role) to the customer view, same as a customer with no memberships", async () => {
    authRole = "staff";
    mocks.membershipsList.mockResolvedValue({ memberships: [] });

    render(<TechnologyAssets />);
    expect(await screen.findByText(/no organization to show/i)).toBeInTheDocument();
  });

  it("lets platform_admin add a new technology asset", async () => {
    authRole = "admin";
    mocks.assetsList.mockResolvedValue({ assets: [], backups: [] });
    mocks.createAsset.mockResolvedValue({ asset: asset() });

    render(<TechnologyAssets />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no technology assets/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^type$/i), "laptop");
    await userEvent.type(screen.getByLabelText(/^label$/i), "Front desk laptop");
    await userEvent.click(screen.getByRole("button", { name: /^add asset$/i }));

    expect(mocks.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", type: "laptop", label: "Front desk laptop" })
    );
  });

  it("renders backups fetched from the server (not local session state)", async () => {
    authRole = "admin";
    mocks.assetsList.mockResolvedValue({
      assets: [],
      backups: [backup({ restoreVerified: true, restoreVerifiedAt: "2026-01-02T00:00:00Z" })],
    });

    render(<TechnologyAssets />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/s3:\/\/backups\/org-1\/source-2026-01-01\.tar\.gz/i)).toBeInTheDocument();
    expect(screen.getByText(/^restore verified$/i)).toBeInTheDocument();
    // Nothing here comes from an earlier recordBackup()/verifyBackup() call
    // in this test -- the list fetch is the only source of this data, and
    // it was only called once so far.
    expect(mocks.assetsList).toHaveBeenCalledTimes(1);
  });

  it("marks a backup restore-verified via the server and refetches the real list", async () => {
    authRole = "admin";
    mocks.assetsList
      .mockResolvedValueOnce({ assets: [], backups: [backup({ restoreVerified: false })] })
      .mockResolvedValueOnce({ assets: [], backups: [backup({ restoreVerified: true, restoreVerifiedAt: "2026-01-02T00:00:00Z" })] });
    mocks.verifyBackup.mockResolvedValue({ message: "Backup marked as restore-verified." });

    render(<TechnologyAssets />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/restore not yet verified/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mark restore-verified/i }));

    expect(mocks.verifyBackup).toHaveBeenCalledWith("backup-1");
    // The now-verified state comes back from a real refetch, not a local flip.
    expect(await screen.findByText(/^restore verified$/i)).toBeInTheDocument();
    expect(mocks.assetsList).toHaveBeenCalledTimes(2);
  });

  it("records a new backup via the server and refetches the real list", async () => {
    authRole = "admin";
    mocks.assetsList
      .mockResolvedValueOnce({ assets: [], backups: [] })
      .mockResolvedValueOnce({ assets: [], backups: [backup()] });
    mocks.recordBackup.mockResolvedValue({ backup: backup() });

    render(<TechnologyAssets />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/no technology assets/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/website profile id/i), "profile-1");
    await userEvent.type(screen.getByLabelText(/^location$/i), "s3://backups/org-1/source-2026-01-01.tar.gz");
    await userEvent.click(screen.getByRole("button", { name: /^record backup$/i }));

    expect(mocks.recordBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        websiteProfileId: "profile-1",
        category: "source",
        location: "s3://backups/org-1/source-2026-01-01.tar.gz",
      })
    );

    // The new backup appears because of a refetch, not a locally-appended item.
    expect(await screen.findByText(/restore not yet verified/i)).toBeInTheDocument();
    expect(mocks.assetsList).toHaveBeenCalledTimes(2);
  });
});
