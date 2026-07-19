import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSupport } from "./CustomerSupport";

const mocks = vi.hoisted(() => ({
  inbox: vi.fn(),
  threadFor: vi.fn(),
  sendTo: vi.fn(),
  notifSend: vi.fn(),
  listForCustomer: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    staffMessages: { inbox: mocks.inbox, threadFor: mocks.threadFor, sendTo: mocks.sendTo },
    staffNotifications: { send: mocks.notifSend },
    customerDocuments: { listForCustomer: mocks.listForCustomer, upload: mocks.upload, remove: mocks.remove },
  },
}));

let authRole: "customer" | "staff" | "admin" = "admin";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function customer(overrides = {}) {
  return { name: "Jane Customer", email: "jane@example.com", ...overrides };
}

function doc(overrides = {}) {
  return { id: "doc-1", customerId: "c1", customerEmail: "jane@example.com", title: "March invoice", type: "invoice" as const, amount: "$150", status: "unpaid" as const, date: "2026-03-01", notes: "", fileName: "", uploadedBy: "u1", uploadedAt: Date.now(), ...overrides };
}

function message(overrides = {}) {
  return { id: "msg-1", customerId: "c1", customerEmail: "jane@example.com", from: "customer" as const, fromName: "Jane Customer", body: "Hi, question about my invoice", createdAt: Date.parse("2026-03-01"), readByStaff: false, readByCustomer: true, ...overrides };
}

describe("CustomerSupport", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "admin";
    mocks.inbox.mockResolvedValue({ customers: [] });
  });

  it("does not show customer support tools to customer accounts, and never calls any API", async () => {
    authRole = "customer";
    render(<CustomerSupport />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(mocks.inbox).not.toHaveBeenCalled();
  });

  it("does not show customer support tools to technician (staff) accounts either", async () => {
    authRole = "staff";
    render(<CustomerSupport />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
  });

  it("shows an empty inbox message when there are no conversations", async () => {
    render(<CustomerSupport />);
    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("lists inbox rows with an unread count", async () => {
    mocks.inbox.mockResolvedValue({
      customers: [{ customerId: "c1", customerEmail: "jane@example.com", lastMessageAt: Date.now(), lastMessageSnippet: "Hi there", unreadCount: 2 }],
    });
    render(<CustomerSupport />);
    expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText(/2 unread/i)).toBeInTheDocument();
  });

  it("looks up a customer by email and shows their messages and documents", async () => {
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [doc()] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [message()] });
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);

    await userEvent.type(screen.getByLabelText(/customer email/i), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));

    expect(await screen.findByText(/found: jane customer/i)).toBeInTheDocument();
    expect(await screen.findByText(/messages with jane customer/i)).toBeInTheDocument();
    expect(screen.getByText("Hi, question about my invoice")).toBeInTheDocument();
    expect(await screen.findByText("March invoice")).toBeInTheDocument();
  });

  it("shows a not-found error and no panels when the looked-up customer doesn't exist", async () => {
    mocks.listForCustomer.mockRejectedValue(new Error("No account found with that email."));
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);

    await userEvent.type(screen.getByLabelText(/customer email/i), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));

    expect(await screen.findByText("No account found with that email.")).toBeInTheDocument();
    expect(screen.queryByText(/^messages with/i)).not.toBeInTheDocument();
  });

  it("opening a conversation from the inbox looks up that same customer", async () => {
    mocks.inbox.mockResolvedValue({
      customers: [{ customerId: "c1", customerEmail: "jane@example.com", lastMessageAt: Date.now(), lastMessageSnippet: "Hi there", unreadCount: 0 }],
    });
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [] });
    render(<CustomerSupport />);
    await screen.findByText("jane@example.com");

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    expect(mocks.listForCustomer).toHaveBeenCalledWith("jane@example.com");
    expect(await screen.findByText(/messages with jane customer/i)).toBeInTheDocument();
  });

  it("sends a reply and refreshes the thread", async () => {
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [] });
    mocks.sendTo.mockResolvedValue({ id: "msg-2", message: "Sent." });
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);

    await userEvent.type(screen.getByLabelText(/customer email/i), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));
    await screen.findByText(/messages with jane customer/i);

    await userEvent.type(screen.getByLabelText(/^reply$/i), "Thanks for reaching out!");
    await userEvent.click(screen.getByRole("button", { name: /^send reply$/i }));

    expect(mocks.sendTo).toHaveBeenCalledWith("jane@example.com", "Thanks for reaching out!");
    expect(mocks.threadFor).toHaveBeenCalledTimes(2); // initial + refresh after send
  });

  it("sends a one-way notification, requiring a title", async () => {
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [] });
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);
    await userEvent.type(screen.getByLabelText(/customer email/i), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));
    await screen.findByText(/send a notification/i);

    await userEvent.click(screen.getByRole("button", { name: /^send notification$/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(mocks.notifSend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^title$/i, { selector: "#support-notif-title" }), "Appointment rescheduled");
    await userEvent.click(screen.getByRole("button", { name: /^send notification$/i }));

    expect(mocks.notifSend).toHaveBeenCalledWith("jane@example.com", "Appointment rescheduled", "");
  });

  it("uploads a document for the looked-up customer", async () => {
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [] });
    mocks.upload.mockResolvedValue({ id: "doc-2", message: "Uploaded." });
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);
    await userEvent.type(screen.getByLabelText(/customer email/i), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));
    await screen.findByText(/upload a document for jane customer/i);

    await userEvent.type(screen.getByLabelText(/^title$/i, { selector: "#support-doc-title" }), "April invoice");
    await userEvent.click(screen.getByRole("button", { name: /^upload for this customer$/i }));

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ customerEmail: "jane@example.com", title: "April invoice", type: "invoice" })
    );
  });

  it("deletes a document after confirming", async () => {
    mocks.listForCustomer.mockResolvedValue({ customer: customer(), documents: [doc()] });
    mocks.threadFor.mockResolvedValue({ customer: customer(), messages: [] });
    mocks.remove.mockResolvedValue({ message: "Deleted." });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CustomerSupport />);
    await screen.findByText(/no conversations yet/i);
    await userEvent.type(screen.getByLabelText(/customer email/i), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^look up customer$/i }));
    await screen.findByText("March invoice");

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith("doc-1");
  });
});
