import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaEnrollVerify } from "./MfaEnrollVerify";

const mocks = vi.hoisted(() => ({ verifyEmail: vi.fn(), setSignedIn: vi.fn() }));

vi.mock("../api/client", () => ({
  api: { auth: { mfaEnrollVerifyEmail: mocks.verifyEmail } },
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ setSignedIn: mocks.setSignedIn }),
}));

describe("MfaEnrollVerify", () => {
  beforeEach(() => {
    mocks.verifyEmail.mockReset();
    mocks.setSignedIn.mockReset();
  });

  it("does not consume the emailed challenge merely by opening the page", () => {
    render(<MemoryRouter initialEntries={["/mfa/enroll-verify?token=secret-token"]}><MfaEnrollVerify /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /confirm and enable/i })).toBeInTheDocument();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("consumes the challenge only after an explicit confirmation click", async () => {
    mocks.verifyEmail.mockResolvedValue({
      recoveryCodes: ["ABCDE-FGHIJ"],
      user: { id: "admin-1", name: "Dylan", email: "dylan@lit-solutions.tech", role: "admin", verified: true },
    });
    render(<MemoryRouter initialEntries={["/mfa/enroll-verify?token=secret-token"]}><MfaEnrollVerify /></MemoryRouter>);

    await userEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    expect(mocks.verifyEmail).toHaveBeenCalledOnce();
    expect(mocks.verifyEmail).toHaveBeenCalledWith("secret-token");
    expect(await screen.findByText("ABCDE-FGHIJ")).toBeInTheDocument();
  });
});
