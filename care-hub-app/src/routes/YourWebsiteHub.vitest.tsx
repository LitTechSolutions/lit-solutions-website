import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { YourWebsiteHub } from "./YourWebsiteHub";

describe("YourWebsiteHub", () => {
  it("links to Website Profiles, Technology Assets, Service Records, and Reminders", () => {
    render(
      <MemoryRouter>
        <YourWebsiteHub />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Your Website" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /website profiles/i })).toHaveAttribute("href", "/website-profiles");
    expect(screen.getByRole("link", { name: /technology assets/i })).toHaveAttribute("href", "/technology-assets");
    expect(screen.getByRole("link", { name: /service records/i })).toHaveAttribute("href", "/service-records");
    expect(screen.getByRole("link", { name: /^reminders/i })).toHaveAttribute("href", "/reminders");
  });
});
