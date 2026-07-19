import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BillingHub } from "./BillingHub";

describe("BillingHub", () => {
  it("links to Subscriptions and Entitlements, its only two cards", () => {
    render(
      <MemoryRouter>
        <BillingHub />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /subscriptions/i })).toHaveAttribute("href", "/subscriptions");
    expect(screen.getByRole("link", { name: /entitlements/i })).toHaveAttribute("href", "/entitlements");
  });
});
