import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProjectHub } from "./ProjectHub";

describe("ProjectHub", () => {
  it("links to Scope of Work and Change Orders, its only two cards", () => {
    render(
      <MemoryRouter>
        <ProjectHub />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /scope of work/i })).toHaveAttribute("href", "/scope-of-work");
    expect(screen.getByRole("link", { name: /change orders/i })).toHaveAttribute("href", "/change-orders");
  });
});
