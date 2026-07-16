import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationAccept } from "./InvitationAccept";

const mocks = vi.hoisted(() => ({ peek: vi.fn(), accept: vi.fn() }));

vi.mock("../api/client", () => ({
  api: { invitations: { peek: mocks.peek, accept: mocks.accept } },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InvitationAccept />
    </MemoryRouter>
  );
}

describe("InvitationAccept", () => {
  beforeEach(() => {
    mocks.peek.mockReset();
    mocks.accept.mockReset();
  });

  it("shows an invalid-link message when there is no token at all", async () => {
    renderAt("/invite");
    expect(await screen.findByText(/isn't valid/i)).toBeInTheDocument();
    expect(mocks.peek).not.toHaveBeenCalled();
  });

  it("shows an invalid-link message when peek rejects (used/revoked/expired token)", async () => {
    mocks.peek.mockRejectedValue(new Error("This invitation link is invalid or has expired."));
    renderAt("/invite?token=bad-token");
    expect(await screen.findByText(/isn't valid/i)).toBeInTheDocument();
  });

  it("shows who invited them once the token peeks successfully", async () => {
    mocks.peek.mockResolvedValue({ email: "new-customer@example.com", role: "org_owner", organizationName: "Acme Co" });
    renderAt("/invite?token=good-token");
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText(/new-customer@example.com/)).toBeInTheDocument();
  });

  it("blocks submission until the terms checkbox is checked, and never calls accept() without it", async () => {
    mocks.peek.mockResolvedValue({ email: "new-customer@example.com", role: "org_owner", organizationName: "Acme Co" });
    renderAt("/invite?token=good-token");
    await screen.findByText("Acme Co");

    await userEvent.type(screen.getByLabelText(/your name/i), "New Customer");
    await userEvent.type(screen.getByLabelText(/choose a password/i), "a-real-password-1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/must agree to the Terms of Service/i)).toBeInTheDocument();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("accepts the invitation once terms are checked, then offers to go sign in (never signs the user in directly)", async () => {
    mocks.peek.mockResolvedValue({ email: "new-customer@example.com", role: "org_owner", organizationName: "Acme Co" });
    mocks.accept.mockResolvedValue({ message: "Account activated." });
    renderAt("/invite?token=good-token");
    await screen.findByText("Acme Co");

    await userEvent.type(screen.getByLabelText(/your name/i), "New Customer");
    await userEvent.type(screen.getByLabelText(/choose a password/i), "a-real-password-1");
    await userEvent.click(screen.getByRole("checkbox", { name: /terms.*conditions/i }));
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("button", { name: /go to sign in/i })).toBeInTheDocument();
    expect(mocks.accept).toHaveBeenCalledWith({
      token: "good-token",
      name: "New Customer",
      password: "a-real-password-1",
      termsAccepted: true,
      marketingConsent: false,
    });
  });
});
