import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPassword } from "./ResetPassword";

const mocks = vi.hoisted(() => ({
  passwordResetRequest: vi.fn(),
  passwordResetConfirm: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: { auth: { passwordResetRequest: mocks.passwordResetRequest, passwordResetConfirm: mocks.passwordResetConfirm } },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResetPassword />
    </MemoryRouter>
  );
}

describe("ResetPassword", () => {
  beforeEach(() => {
    mocks.passwordResetRequest.mockReset();
    mocks.passwordResetConfirm.mockReset();
  });

  it("shows the request form when there is no token, and never calls confirm", async () => {
    renderAt("/reset-password");
    expect(await screen.findByLabelText(/^email$/i)).toBeInTheDocument();
    expect(mocks.passwordResetConfirm).not.toHaveBeenCalled();
  });

  it("submits an email and shows the generic sent message, without revealing whether the account exists", async () => {
    mocks.passwordResetRequest.mockResolvedValue({ message: "If that email is registered, a reset link has been generated." });
    renderAt("/reset-password");

    await userEvent.type(screen.getByLabelText(/^email$/i), "staff@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^send reset link$/i }));

    expect(mocks.passwordResetRequest).toHaveBeenCalledWith("staff@example.com");
    expect(await screen.findByText(/if that email is registered/i)).toBeInTheDocument();
  });

  it("shows the new-password form when a token is present, and never calls request", async () => {
    renderAt("/reset-password?token=good-token");
    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument();
    expect(mocks.passwordResetRequest).not.toHaveBeenCalled();
  });

  it("submits a new password with the token and offers to go sign in on success", async () => {
    mocks.passwordResetConfirm.mockResolvedValue({ message: "Password updated." });
    renderAt("/reset-password?token=good-token");

    await userEvent.type(screen.getByLabelText(/new password/i), "a-real-password-1");
    await userEvent.click(screen.getByRole("button", { name: /^update password$/i }));

    expect(mocks.passwordResetConfirm).toHaveBeenCalledWith("good-token", "a-real-password-1");
    expect(await screen.findByRole("button", { name: /go to sign in/i })).toBeInTheDocument();
  });

  it("shows the backend's error message when the token is invalid or expired", async () => {
    mocks.passwordResetConfirm.mockRejectedValue(new Error("Invalid or expired reset link."));
    renderAt("/reset-password?token=bad-token");

    await userEvent.type(screen.getByLabelText(/new password/i), "a-real-password-1");
    await userEvent.click(screen.getByRole("button", { name: /^update password$/i }));

    expect(await screen.findByText("Invalid or expired reset link.")).toBeInTheDocument();
  });
});
