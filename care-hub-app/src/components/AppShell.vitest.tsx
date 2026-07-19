import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

function renderShell(role: "customer" | "staff" | "admin") {
  return render(
    <MemoryRouter>
      <AppShell role={role} userName="Test User">
        <div>Page content</div>
      </AppShell>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  it("gives a customer a short flat nav -- no group labels, no admin/staff-only links, reference screens tucked behind the 3 hub pages", () => {
    renderShell("customer");

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Readiness Checklists" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your Website" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();

    expect(screen.queryByText("Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Account & Billing")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    [
      "Organizations", "Templates", "Metrics", "Audit Log", "Site Content", "Image Library", "Customer Support",
      "IT Support", "Work Log", "Activity Timeline", "Scope of Work", "Change Orders", "Website Profiles",
      "Technology Assets", "Service Records", "Subscriptions", "Entitlements", "Reminders",
    ].forEach((label) => {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    });
  });

  it("gives a technician (staff) the full Work/Account & Billing groups, minus the platform_admin-only items", () => {
    renderShell("staff");

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Account & Billing")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "IT Support" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Work Log" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Service Records" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Activity Timeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Organizations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Templates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Metrics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit Log" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Site Content" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Image Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Customer Support" })).not.toBeInTheDocument();
  });

  it("gives platform_admin every group, including Admin -- and the 3 capabilities migrated from admin.html", () => {
    renderShell("admin");

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Account & Billing")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Organizations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Site Content" })).toHaveAttribute("href", "/site-content");
    expect(screen.getByRole("link", { name: "Image Library" })).toHaveAttribute("href", "/image-library");
    expect(screen.getByRole("link", { name: "Customer Support" })).toHaveAttribute("href", "/customer-support");

    expect(screen.queryByRole("link", { name: "Activity Timeline" })).not.toBeInTheDocument();
  });

  it("calls onSignOut when the sign-out button is clicked", async () => {
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <AppShell role="admin" onSignOut={onSignOut}>
          <div>Page</div>
        </AppShell>
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("renders the page content passed as children", () => {
    renderShell("customer");
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
