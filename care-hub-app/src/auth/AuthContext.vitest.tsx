import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { NetworkError, SessionExpiredError } from "../api/errors";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn() }));
vi.mock("../api/client", () => ({
  api: { account: { get: mocks.getAccount }, auth: { logout: vi.fn() } },
}));

function StateProbe() {
  const { state } = useAuth();
  return <div>{state.status}{state.status === "error" ? `:${state.message}` : ""}</div>;
}

describe("AuthProvider", () => {
  it("shows a service error instead of pretending a network failure signed the user out", async () => {
    mocks.getAccount.mockRejectedValueOnce(new NetworkError("offline"));
    render(<AuthProvider><StateProbe /></AuthProvider>);
    expect(await screen.findByText("error:offline")).toBeInTheDocument();
  });

  it("uses signedOut only for an actual unauthenticated response", async () => {
    mocks.getAccount.mockRejectedValueOnce(new SessionExpiredError("expired", null));
    render(<AuthProvider><StateProbe /></AuthProvider>);
    expect(await screen.findByText("signedOut")).toBeInTheDocument();
  });
});
