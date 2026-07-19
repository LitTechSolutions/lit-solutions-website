import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteContent } from "./SiteContent";

const mocks = vi.hoisted(() => ({
  contentGet: vi.fn(),
  contentSave: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    content: { get: mocks.contentGet, save: mocks.contentSave },
  },
}));

let authRole: "customer" | "staff" | "admin" = "admin";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function post(overrides = {}) {
  return {
    id: "post-1", title: "Hello World", slug: "hello-world", category: "Website",
    date: "2026-01-01", excerpt: "An excerpt", body: "Body text", imageDataUri: "",
    ...overrides,
  };
}

describe("SiteContent", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "admin";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("does not show site content management to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<SiteContent />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(mocks.contentGet).not.toHaveBeenCalled();
  });

  it("does not show site content management to technician (staff) accounts either", async () => {
    authRole = "staff";
    render(<SiteContent />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
  });

  it("loads Blog Posts by default and lists existing items", async () => {
    mocks.contentGet.mockResolvedValue({ data: [post()], updatedAt: Date.now() });
    render(<SiteContent />);

    expect(mocks.contentGet).toHaveBeenCalledWith("blog-posts");
    expect(await screen.findByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText(/website · 2026-01-01/i)).toBeInTheDocument();
  });

  it("switches tabs and fetches the other content type's slug", async () => {
    mocks.contentGet.mockResolvedValue({ data: [], updatedAt: null });
    render(<SiteContent />);
    await screen.findByRole("heading", { name: /add new/i });

    await userEvent.click(screen.getByRole("tab", { name: "Portfolio" }));

    expect(mocks.contentGet).toHaveBeenLastCalledWith("portfolio-items");
  });

  it("adds a new blog post, auto-generating the slug from the title, and saves the full array", async () => {
    mocks.contentGet.mockResolvedValue({ data: [], updatedAt: null });
    mocks.contentSave.mockResolvedValue({ message: "Saved." });
    render(<SiteContent />);
    await screen.findByRole("heading", { name: /add new/i });

    await userEvent.type(screen.getByLabelText(/^title$/i), "My New Post");
    await userEvent.click(screen.getByRole("button", { name: /^add item$/i }));

    expect(mocks.contentSave).toHaveBeenCalledWith(
      "blog-posts",
      expect.arrayContaining([expect.objectContaining({ title: "My New Post", slug: "my-new-post" })])
    );
    expect(await screen.findByText(/live on the site now/i)).toBeInTheDocument();
  });

  it("blocks adding an item missing a required field, and never calls save", async () => {
    mocks.contentGet.mockResolvedValue({ data: [], updatedAt: null });
    render(<SiteContent />);
    await screen.findByRole("heading", { name: /add new/i });

    await userEvent.click(screen.getByRole("button", { name: /^add item$/i }));

    expect(await screen.findByText(/please fill in/i)).toBeInTheDocument();
    expect(mocks.contentSave).not.toHaveBeenCalled();
  });

  it("edits an existing item and saves the updated array", async () => {
    mocks.contentGet.mockResolvedValue({ data: [post()], updatedAt: Date.now() });
    mocks.contentSave.mockResolvedValue({ message: "Saved." });
    render(<SiteContent />);
    await screen.findByText("Hello World");

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const titleInput = screen.getByLabelText(/^title$/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated Title");
    await userEvent.click(screen.getByRole("button", { name: /^update item$/i }));

    expect(mocks.contentSave).toHaveBeenCalledWith(
      "blog-posts",
      expect.arrayContaining([expect.objectContaining({ id: "post-1", title: "Updated Title" })])
    );
  });

  it("deletes an item after confirming, and rolls back the visible list if the save fails", async () => {
    mocks.contentGet.mockResolvedValue({ data: [post()], updatedAt: Date.now() });
    mocks.contentSave.mockRejectedValue(new Error("Network down"));
    render(<SiteContent />);
    await screen.findByText("Hello World");

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    // Rolled back -- the item is still shown since the save failed.
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("reorders items with the up/down buttons and persists the new order", async () => {
    mocks.contentGet.mockResolvedValue({ data: [post({ id: "a", title: "First" }), post({ id: "b", title: "Second" })], updatedAt: Date.now() });
    mocks.contentSave.mockResolvedValue({ message: "Saved." });
    render(<SiteContent />);
    await screen.findByText("First");

    const downButtons = screen.getAllByRole("button", { name: /move down/i });
    await userEvent.click(downButtons[0]);

    expect(mocks.contentSave).toHaveBeenCalledWith(
      "blog-posts",
      [expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "a" })]
    );
  });
});
