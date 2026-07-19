import { afterEach, describe, expect, it, vi } from "vitest";
import { request, registerSessionExpiredHandler } from "./http";
import { SessionExpiredError } from "./errors";

function mockFetchOnce(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe("request()", () => {
  afterEach(() => {
    registerSessionExpiredHandler(null);
    vi.restoreAllMocks();
  });

  it("throws SessionExpiredError on a 401, regardless of any registered handler", async () => {
    mockFetchOnce(401, { error: "Sign in required." });
    await expect(request("/tickets")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("calls the registered session-expired handler exactly once on a 401", async () => {
    mockFetchOnce(401, { error: "Sign in required." });
    const handler = vi.fn();
    registerSessionExpiredHandler(handler);

    await expect(request("/tickets")).rejects.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("never calls the session-expired handler for a non-401 error", async () => {
    mockFetchOnce(403, { error: "Not allowed." });
    const handler = vi.fn();
    registerSessionExpiredHandler(handler);

    await expect(request("/tickets")).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing (no crash) when no handler is registered", async () => {
    mockFetchOnce(401, { error: "Sign in required." });
    registerSessionExpiredHandler(null);
    await expect(request("/tickets")).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
