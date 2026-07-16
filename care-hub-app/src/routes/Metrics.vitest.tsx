import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Metrics } from "./Metrics";

const mocks = vi.hoisted(() => ({
  metricsSummary: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    metrics: { summary: mocks.metricsSummary },
  },
}));

// See Templates.vitest.tsx's comment on this mock -- strings/en.ts's real
// `metrics` section doesn't exist yet (the orchestrating session merges
// it in afterward), so layer the exact keys this screen renders on top
// of the real, unmodified strings object rather than editing that shared
// file directly.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    ...actual,
    strings: {
      ...actual.strings,
      metrics: {
        title: "Metrics",
        notPlatformAdminTitle: "Not available for this account",
        notPlatformAdminBody: "Operational metrics are only available to platform administrator accounts.",
        fromLabel: "From",
        toLabel: "To",
        submitButton: "Get summary",
        submitting: "Loading…",
        emptyBody: "No events recorded for that date range.",
        byTypeHeading: "Events by type",
        byDayHeading: "Events by day",
        typeColumnLabel: "Type",
        dayColumnLabel: "Date",
        countColumnLabel: "Count",
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

describe("Metrics", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("does not show the metrics screen to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<Metrics />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.metricsSummary).not.toHaveBeenCalled();
  });

  it("also excludes technician (staff) accounts, not just customers", async () => {
    authRole = "staff";
    render(<Metrics />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.metricsSummary).not.toHaveBeenCalled();
  });

  it("lets a platform_admin request a summary and renders both tables sorted", async () => {
    authRole = "admin";
    mocks.metricsSummary.mockResolvedValue({
      summary: {
        byType: { email: 3, ticket: 7, webhook: 7 },
        byDay: { "2026-02-03": 4, "2026-02-01": 2, "2026-02-02": 5 },
      },
    });

    const { container } = render(<Metrics />);

    await userEvent.type(screen.getByLabelText(/^from$/i), "2026-02-01");
    await userEvent.type(screen.getByLabelText(/^to$/i), "2026-02-03");
    await userEvent.click(screen.getByRole("button", { name: /get summary/i }));

    expect(mocks.metricsSummary).toHaveBeenCalledWith("2026-02-01", "2026-02-03");
    expect(await screen.findByText("ticket")).toBeInTheDocument();

    const text = container.textContent ?? "";
    // byType: count desc, ties broken alphabetically -- ticket and webhook tie at 7, "ticket" < "webhook".
    expect(text.indexOf("ticket")).toBeLessThan(text.indexOf("webhook"));
    expect(text.indexOf("webhook")).toBeLessThan(text.indexOf("email"));
    // byDay: chronological ascending.
    expect(text.indexOf("2026-02-01")).toBeLessThan(text.indexOf("2026-02-02"));
    expect(text.indexOf("2026-02-02")).toBeLessThan(text.indexOf("2026-02-03"));
  });

  it("shows an inline error if the summary request fails", async () => {
    authRole = "admin";
    mocks.metricsSummary.mockRejectedValue(new Error("Boom"));

    render(<Metrics />);
    await userEvent.type(screen.getByLabelText(/^from$/i), "2026-02-01");
    await userEvent.type(screen.getByLabelText(/^to$/i), "2026-02-03");
    await userEvent.click(screen.getByRole("button", { name: /get summary/i }));

    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });

  it("shows an empty message in both sections when the range has no events", async () => {
    authRole = "admin";
    mocks.metricsSummary.mockResolvedValue({ summary: { byType: {}, byDay: {} } });

    render(<Metrics />);
    await userEvent.type(screen.getByLabelText(/^from$/i), "2026-02-01");
    await userEvent.type(screen.getByLabelText(/^to$/i), "2026-02-03");
    await userEvent.click(screen.getByRole("button", { name: /get summary/i }));

    expect(await screen.findAllByText(/no events recorded/i)).toHaveLength(2);
  });
});
