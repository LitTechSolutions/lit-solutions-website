import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Account } from "./Account";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  updateName: vi.fn(),
  updatePassword: vi.fn(),
  updateEmail: vi.fn(),
  updatePreferences: vi.fn(),
  mfaReset: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    account: {
      get: mocks.get,
      updateName: mocks.updateName,
      updatePassword: mocks.updatePassword,
      updateEmail: mocks.updateEmail,
      updatePreferences: mocks.updatePreferences,
    },
    auth: { mfaReset: mocks.mfaReset },
  },
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
}));

function customerAccount() {
  return {
    user: {
      id: "cust-1",
      name: "Jamie Customer",
      email: "jamie@example.com",
      role: "customer" as const,
      verified: true,
      preferences: { timezone: "", emailNotifications: true },
    },
  };
}

function adminAccount() {
  return {
    user: {
      id: "admin-1",
      name: "Dylan",
      email: "dylan@lit-solutions.tech",
      role: "admin" as const,
      verified: true,
      preferences: { timezone: "", emailNotifications: true },
    },
  };
}

describe("Account", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("shows who's signed in once loaded", async () => {
    mocks.get.mockResolvedValue(customerAccount());
    render(<Account />);
    expect(await screen.findByText("Jamie Customer", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/jamie@example\.com/)).toBeInTheDocument();
  });

  it("does not show MFA management for a non-admin account", async () => {
    mocks.get.mockResolvedValue(customerAccount());
    render(<Account />);
    await screen.findByText(/jamie@example\.com/);
    expect(screen.queryByText(/two-factor authentication/i)).not.toBeInTheDocument();
  });

  it("shows MFA management for a platform_admin account", async () => {
    mocks.get.mockResolvedValue(adminAccount());
    render(<Account />);
    expect(await screen.findByRole("heading", { name: /two-factor authentication/i })).toBeInTheDocument();
  });

  it("updates the name without signing the user out", async () => {
    mocks.get.mockResolvedValue(customerAccount());
    mocks.updateName.mockResolvedValue({ message: "Name updated.", user: { ...customerAccount().user, name: "New Name" } });
    render(<Account />);
    await screen.findByText(/jamie@example\.com/);

    const nameInput = screen.getByLabelText(/^name$/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");
    await userEvent.click(screen.getByRole("button", { name: /update name/i }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(mocks.updateName).toHaveBeenCalledWith("New Name");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("saves a timezone chosen from the dropdown (not typed) without signing the user out", async () => {
    mocks.get.mockResolvedValue(customerAccount());
    mocks.updatePreferences.mockResolvedValue({ preferences: { timezone: "America/Chicago", emailNotifications: true } });
    render(<Account />);
    await screen.findByText(/jamie@example\.com/);

    await userEvent.selectOptions(screen.getByLabelText(/timezone/i), "America/Chicago");
    await userEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    expect(mocks.updatePreferences).toHaveBeenCalledWith({ timezone: "America/Chicago", emailNotifications: true });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs the user out after a successful password change (server already revoked the session)", async () => {
    mocks.get.mockResolvedValue(customerAccount());
    mocks.updatePassword.mockResolvedValue({ message: "Password updated. Please sign in again." });
    render(<Account />);
    await screen.findByText(/jamie@example\.com/);

    await userEvent.type(screen.getByLabelText(/current password/i, { selector: "#account-current-pw" }), "old-password-1");
    await userEvent.type(screen.getByLabelText(/new password/i), "a-brand-new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(mocks.updatePassword).toHaveBeenCalledWith("old-password-1", "a-brand-new-password-1");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("resets MFA (admin only) and signs out afterward", async () => {
    mocks.get.mockResolvedValue(adminAccount());
    mocks.mfaReset.mockResolvedValue({ message: "Two-factor authentication has been reset." });
    render(<Account />);
    await screen.findByRole("heading", { name: /two-factor authentication/i });

    await userEvent.type(screen.getByLabelText(/current password/i, { selector: "#account-mfa-pw" }), "admin-password-1");
    await userEvent.click(screen.getByRole("button", { name: /reset two-factor authentication/i }));

    expect(mocks.mfaReset).toHaveBeenCalledWith("admin-password-1");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
