import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkLog } from "./WorkLog";

const mocks = vi.hoisted(() => ({
  ticketsList: vi.fn(),
  workLogTotal: vi.fn(),
  workLogRecordTime: vi.fn(),
  workLogRecordNote: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    tickets: { list: mocks.ticketsList },
    workLog: { total: mocks.workLogTotal, recordTime: mocks.workLogRecordTime, recordNote: mocks.workLogRecordNote },
  },
}));

let authRole: "customer" | "staff" | "admin" = "staff";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function ticket(overrides = {}) {
  return {
    id: "t1",
    organizationId: "org-1",
    category: "it_support",
    subject: "Server migration",
    description: "Move files to new NAS",
    status: "in_progress" as const,
    submittedAt: "2026-01-01T00:00:00Z",
    submittedBy: "u1",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    ...overrides,
  };
}

describe("WorkLog", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "staff";
  });

  it("tells customer accounts this screen isn't shown to them, without loading tickets", async () => {
    authRole = "customer";
    render(<WorkLog />);
    expect(await screen.findByText(/not shown to customer accounts/i)).toBeInTheDocument();
    expect(mocks.ticketsList).not.toHaveBeenCalled();
  });

  it("shows the running total and lets a technician log time against a ticket", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.workLogTotal.mockResolvedValue({ totalMinutes: 30 });
    mocks.workLogRecordTime.mockResolvedValue({
      entry: { id: "te-1", ticketId: "t1", technicianUserId: "u1", minutes: 15, recordedAt: "2026-02-01T00:00:00Z" },
    });

    render(<WorkLog />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/30 minutes/i)).toBeInTheDocument();

    mocks.workLogTotal.mockResolvedValue({ totalMinutes: 45 });
    await userEvent.clear(screen.getByLabelText(/^minutes$/i));
    await userEvent.type(screen.getByLabelText(/^minutes$/i), "15");
    await userEvent.click(screen.getByRole("button", { name: /^log time$/i }));

    expect(mocks.workLogRecordTime).toHaveBeenCalledWith("t1", "org-1", 15, undefined);
    expect(await screen.findByText(/45 minutes/i)).toBeInTheDocument();
  });

  it("lets a technician add an internal note independently of logging time", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.workLogTotal.mockResolvedValue({ totalMinutes: 0 });
    mocks.workLogRecordNote.mockResolvedValue({ note: {} });

    render(<WorkLog />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));

    expect(await screen.findByText(/0 minutes/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^note$/i), "Confirmed backups before migration.");
    await userEvent.click(screen.getByRole("button", { name: /^add note$/i }));

    expect(mocks.workLogRecordNote).toHaveBeenCalledWith("t1", "org-1", "Confirmed backups before migration.");
    expect(await screen.findByText(/note added/i)).toBeInTheDocument();
    expect(mocks.workLogTotal).toHaveBeenCalledTimes(1);
  });

  it("shows a no-tickets message when the organization has none", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [] });
    render(<WorkLog />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(await screen.findByText(/tied to a ticket/i)).toBeInTheDocument();
  });

  it("surfaces a backend validation error from logging time inline", async () => {
    mocks.ticketsList.mockResolvedValue({ tickets: [ticket()] });
    mocks.workLogTotal.mockResolvedValue({ totalMinutes: 0 });
    mocks.workLogRecordTime.mockRejectedValue(new Error("timeEntry: minutes must be a positive number"));

    render(<WorkLog />);
    await userEvent.type(screen.getByLabelText(/organization id/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(await screen.findByText(/0 minutes/i)).toBeInTheDocument();

    // A value satisfying the input's own min=1 hint -- this is testing a
    // backend rule the client doesn't otherwise pre-check (mirrors the
    // "don't pre-detect assignment client-side" philosophy from
    // ItSupport.tsx), not the native HTML5 constraint validation.
    await userEvent.clear(screen.getByLabelText(/^minutes$/i));
    await userEvent.type(screen.getByLabelText(/^minutes$/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /^log time$/i }));
    expect(await screen.findByText(/minutes must be a positive number/i)).toBeInTheDocument();
  });
});
