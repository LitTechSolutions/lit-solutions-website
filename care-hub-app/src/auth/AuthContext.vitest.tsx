import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { NetworkError, SessionExpiredError } from "../api/errors";
import { request } from "../api/http";

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

  // Regression: a route's own data fetch discovering a 401 used to be the
  // *only* place that found out -- RequireAuth's top-level state stayed
  // signedIn, so AppShell kept rendering its nav/topbar around that
  // route's own "sign in again" prompt. Confirms a real (unmocked) 401
  // from ANY request -- not just the initial account.get() check -- now
  // flips the shared AuthContext state too, via api/http.ts's registered
  // handler, so RequireAuth swaps to its clean signedOut redirect instead.
  it("flips to signedOut when a later, unrelated request hits a real 401 -- not just the initial sign-in check", async () => {
    mocks.getAccount.mockResolvedValueOnce({
      user: { id: "u1", name: "Test", email: "t@example.com", role: "customer", verified: true },
    });
    render(
      <AuthProvider>
        <StateProbe />
      </AuthProvider>
    );
    expect(await screen.findByText("signedIn")).toBeInTheDocument();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Sign in required." }),
    }) as unknown as typeof fetch;

    try {
      await expect(request("/tickets")).rejects.toThrow();
      expect(await screen.findByText("signedOut")).toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
