import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireRoute } from "./RequireRoute";
import type { RouteKey } from "./navAccess";

let authRole: "customer" | "staff" | "admin" = "admin";
vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    state: { status: "signedIn", user: { id: "u1", name: "Test", email: "t@example.com", role: authRole, verified: true } },
  }),
}));

function renderGuarded(routeKey: RouteKey) {
  return render(
    <MemoryRouter initialEntries={["/guarded"]}>
      <Routes>
        <Route path="/" element={<div>Dashboard landing</div>} />
        <Route
          path="/guarded"
          element={
            <RequireRoute routeKey={routeKey}>
              <div>Secret content</div>
            </RequireRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireRoute", () => {
  beforeEach(() => {
    authRole = "admin";
  });

  it("renders the guarded route for a role the access table allows", () => {
    authRole = "admin";
    renderGuarded("organizations");
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it("redirects a customer away from an admin-only route, without rendering the guarded content", () => {
    authRole = "customer";
    renderGuarded("organizations");
    expect(screen.getByText("Dashboard landing")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("redirects a technician (staff) away from an admin-only route too", () => {
    authRole = "staff";
    renderGuarded("templates");
    expect(screen.getByText("Dashboard landing")).toBeInTheDocument();
  });

  it("redirects a customer away from a staff-only route", () => {
    authRole = "customer";
    renderGuarded("itSupport");
    expect(screen.getByText("Dashboard landing")).toBeInTheDocument();
  });

  it("redirects staff and admin away from the customer-only activity timeline route", () => {
    authRole = "staff";
    renderGuarded("activityTimeline");
    expect(screen.getByText("Dashboard landing")).toBeInTheDocument();
  });

  it("lets a customer reach the customer-only activity timeline route", () => {
    authRole = "customer";
    renderGuarded("activityTimeline");
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
