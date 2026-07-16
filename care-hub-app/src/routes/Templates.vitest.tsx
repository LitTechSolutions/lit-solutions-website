import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Templates } from "./Templates";

const mocks = vi.hoisted(() => ({
  templatesCreate: vi.fn(),
  templatesRender: vi.fn(),
  templatesList: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    templates: { create: mocks.templatesCreate, render: mocks.templatesRender, list: mocks.templatesList },
  },
}));

// strings/en.ts's real `templates` section is updated to match this
// screen's real fetch-driven "existing templates" list (see
// src/routes/Templates.tsx's module comment) as part of the same change
// that added templates.js's list-without-a-key route. The orchestrating
// session merges every screen's reported string additions into the real
// file -- until/unless that lands exactly as reported, layer the keys
// this screen actually renders on top of the real (unmodified) strings
// object via importActual, so this suite exercises real component logic
// against the exact copy reported for strings/en.ts, not a hand-wavy
// stand-in.
vi.mock("../strings/en", async () => {
  const actual = await vi.importActual<typeof import("../strings/en")>("../strings/en");
  return {
    ...actual,
    strings: {
      ...actual.strings,
      templates: {
        title: "Templates",
        notPlatformAdminTitle: "Not available for this account",
        notPlatformAdminBody:
          "Notification templates are managed by platform administrators only. If you believe this is a mistake, contact us.",
        createHeading: "Create a template",
        keyLabel: "Key",
        subjectLabel: "Subject",
        bodyLabel: "Body",
        allowedVariablesLabel: "Allowed variables (comma-separated)",
        allowedVariablesHelp:
          "e.g. customerName, ticketSubject -- these are the only variable names the render/preview form below will accept for this template.",
        createButton: "Create template",
        creating: "Creating…",
        createdHeading: "Existing templates",
        createdEmptyBody: "No templates have been created yet. Templates you create above will appear here.",
        variablesLabel: "Variables",
        renderHeading: "Render / preview a template",
        renderHelp:
          "Choose an existing template to render it with sample values -- its allowed variables fill in automatically. If no templates have been created yet, enter a key manually.",
        renderKeyLabel: "Template key",
        renderKeyPlaceholder: "Select a template…",
        variableNameLabel: "Variable name",
        variableValueLabel: "Variable value",
        addVariable: "Add variable",
        renderButton: "Render template",
        rendering: "Rendering…",
        renderedSubjectLabel: "Rendered subject",
        renderedBodyLabel: "Rendered body",
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

function templateDefinition(overrides = {}) {
  return {
    id: "tmpl-1",
    key: "welcome_email",
    subject: "Welcome, {{customerName}}",
    body: "Hi {{customerName}}, welcome aboard.",
    allowedVariables: ["customerName"] as string[],
    ...overrides,
  };
}

describe("Templates", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    authRole = "customer";
  });

  it("does not show the templates screen to customer accounts, and never calls the API", async () => {
    authRole = "customer";
    render(<Templates />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.templatesCreate).not.toHaveBeenCalled();
    expect(mocks.templatesRender).not.toHaveBeenCalled();
    expect(mocks.templatesList).not.toHaveBeenCalled();
  });

  it("also excludes technician (staff) accounts, not just customers", async () => {
    authRole = "staff";
    render(<Templates />);
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(mocks.templatesCreate).not.toHaveBeenCalled();
    expect(mocks.templatesList).not.toHaveBeenCalled();
  });

  it("fetches existing templates for a platform_admin and shows an empty state before any exist", async () => {
    authRole = "admin";
    mocks.templatesList.mockResolvedValue({ definitions: [] });

    render(<Templates />);

    expect(await screen.findByText(/existing templates/i)).toBeInTheDocument();
    // A more specific fragment than "no templates have been created yet"
    // on its own -- the render form's help text below also mentions that
    // phrase (for its own manual-entry fallback copy), so matching only
    // the tail unique to this empty state avoids an ambiguous multi-match.
    expect(await screen.findByText(/templates you create above will appear here/i)).toBeInTheDocument();
    expect(mocks.templatesList).toHaveBeenCalled();
  });

  it("lets a platform_admin create a template and see it appear in the real fetched list afterward", async () => {
    authRole = "admin";
    mocks.templatesList.mockResolvedValueOnce({ definitions: [] }).mockResolvedValue({ definitions: [templateDefinition()] });
    mocks.templatesCreate.mockResolvedValue({ definition: templateDefinition() });

    render(<Templates />);

    expect(await screen.findByText(/templates you create above will appear here/i)).toBeInTheDocument();

    // Plain text on purpose -- @testing-library/user-event's type() treats
    // curly braces as special-key escape syntax (e.g. "{enter}"), so real
    // mustache-style "{{var}}" placeholders can't be typed literally here.
    // The component doesn't parse subject/body at all, so this is still a
    // faithful check of the create-form wiring.
    await userEvent.type(screen.getByLabelText(/^key$/i), "welcome_email");
    await userEvent.type(screen.getByLabelText(/^subject$/i), "Welcome aboard");
    await userEvent.type(screen.getByLabelText(/^body$/i), "Hi there, welcome aboard.");
    await userEvent.type(screen.getByLabelText(/allowed variables/i), "customerName");
    await userEvent.click(screen.getByRole("button", { name: /^create template$/i }));

    expect(mocks.templatesCreate).toHaveBeenCalledWith({
      key: "welcome_email",
      subject: "Welcome aboard",
      body: "Hi there, welcome aboard.",
      allowedVariables: ["customerName"],
    });
    // Confirms the list was refetched (not appended to client-side) --
    // the created row only shows up once the second (post-retry) list
    // response resolves. Scoped to the <ul> specifically: once the list
    // is non-empty, the render form's key picker also gets an
    // <option>welcome_email</option>, so an unscoped text query would
    // ambiguously match both.
    const list = await screen.findByRole("list");
    expect(within(list).getByText("welcome_email")).toBeInTheDocument();
  });

  it("populates the render form's key picker from existing templates and auto-fills allowed variables on selection", async () => {
    authRole = "admin";
    mocks.templatesList.mockResolvedValue({
      definitions: [templateDefinition({ allowedVariables: ["customerName", "ticketSubject"] })],
    });
    mocks.templatesRender.mockResolvedValue({
      rendered: { subject: "Welcome, Dylan re: Billing", body: "Body" },
    });

    render(<Templates />);

    // Queried by role, not screen.findByLabelText -- the key field starts
    // out as a plain text input (role "textbox") before the template list
    // resolves and only then swaps to a <select> (role "combobox"), both
    // of which satisfy a label-text query equally. Waiting on the
    // "combobox" role specifically ensures this waits for the swap
    // instead of resolving immediately against the stale text input.
    const picker = await screen.findByRole("combobox", { name: /template key/i });
    await userEvent.selectOptions(picker, "welcome_email");

    const nameInputs = screen.getAllByLabelText(/variable name/i);
    expect(nameInputs).toHaveLength(2);
    expect(nameInputs[0]).toHaveValue("customerName");
    expect(nameInputs[1]).toHaveValue("ticketSubject");

    const valueInputs = screen.getAllByLabelText(/variable value/i);
    await userEvent.type(valueInputs[0], "Dylan");
    await userEvent.type(valueInputs[1], "Billing");

    await userEvent.click(screen.getByRole("button", { name: /^render template$/i }));

    expect(mocks.templatesRender).toHaveBeenCalledWith("welcome_email", { customerName: "Dylan", ticketSubject: "Billing" });
    expect(await screen.findByText(/welcome, dylan re: billing/i)).toBeInTheDocument();
  });

  it("falls back to a manual key input, and still supports adding more than one variable pair, when no templates exist yet", async () => {
    authRole = "admin";
    mocks.templatesList.mockResolvedValue({ definitions: [] });
    mocks.templatesRender.mockResolvedValue({
      rendered: { subject: "Hi Dylan re: Billing", body: "Body" },
    });

    render(<Templates />);

    const keyInput = await screen.findByLabelText(/template key/i);
    expect(keyInput.tagName).toBe("INPUT");

    await userEvent.type(keyInput, "welcome_email");
    await userEvent.type(screen.getByLabelText(/variable name/i), "customerName");
    await userEvent.type(screen.getByLabelText(/variable value/i), "Dylan");
    await userEvent.click(screen.getByRole("button", { name: /add variable/i }));

    const nameInputs = screen.getAllByLabelText(/variable name/i);
    const valueInputs = screen.getAllByLabelText(/variable value/i);
    await userEvent.type(nameInputs[1], "ticketSubject");
    await userEvent.type(valueInputs[1], "Billing");

    await userEvent.click(screen.getByRole("button", { name: /^render template$/i }));

    expect(mocks.templatesRender).toHaveBeenCalledWith("welcome_email", {
      customerName: "Dylan",
      ticketSubject: "Billing",
    });
  });
});
