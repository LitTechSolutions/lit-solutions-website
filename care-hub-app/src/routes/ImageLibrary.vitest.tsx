import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageLibrary } from "./ImageLibrary";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    imageLibrary: { list: mocks.list, upload: mocks.upload, remove: mocks.remove },
  },
}));

let authRole: "customer" | "staff" | "admin" = "admin";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function image(overrides = {}) {
  return { id: "img-1", url: "https://res.cloudinary.com/demo/image.png", alt: "A photo", caption: "", uploadedAt: Date.parse("2026-01-01"), ...overrides };
}

describe("ImageLibrary", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "admin";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("does not show the image library to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<ImageLibrary />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("does not show the image library to technician (staff) accounts either", async () => {
    authRole = "staff";
    render(<ImageLibrary />);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
  });

  it("shows an empty message when no images have been uploaded", async () => {
    mocks.list.mockResolvedValue({ images: [] });
    render(<ImageLibrary />);
    expect(await screen.findByText(/no images uploaded yet/i)).toBeInTheDocument();
  });

  it("lists existing images", async () => {
    mocks.list.mockResolvedValue({ images: [image()] });
    render(<ImageLibrary />);
    expect(await screen.findByText("A photo")).toBeInTheDocument();
  });

  it("rejects uploading without choosing a file first", async () => {
    mocks.list.mockResolvedValue({ images: [] });
    render(<ImageLibrary />);
    await screen.findByText(/no images uploaded yet/i);

    await userEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByText(/choose a file first/i)).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads a chosen file with its alt text, then refreshes the list", async () => {
    mocks.list.mockResolvedValue({ images: [] });
    mocks.upload.mockResolvedValue({ id: "img-2", url: "https://res.cloudinary.com/demo/new.png", message: "Uploaded." });
    render(<ImageLibrary />);
    await screen.findByText(/no images uploaded yet/i);

    const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/upload an image/i) as HTMLInputElement;
    await userEvent.upload(fileInput, file);
    await userEvent.type(screen.getByLabelText(/alt text/i), "New photo");
    await userEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByText("Uploaded ✓")).toBeInTheDocument();
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^data:/), "New photo");
    expect(mocks.list).toHaveBeenCalledTimes(2); // initial load + refresh after upload
  });

  it("deletes an image after confirming", async () => {
    mocks.list.mockResolvedValue({ images: [image()] });
    mocks.remove.mockResolvedValue({ message: "Deleted." });
    render(<ImageLibrary />);
    await screen.findByText("A photo");

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith("img-1");
  });
});
