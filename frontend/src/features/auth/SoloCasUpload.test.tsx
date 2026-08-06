import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SoloCasUpload } from "./SoloCasUpload";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, listHouseholdMembers: vi.fn(), createHouseholdMember: vi.fn() };
});

// SoloCasUpload calls useAuth, which throws outside AuthProvider — wrap like
// OnboardingFlow.test.tsx does. No stored token, so the provider stays logged out.
function renderSolo(name: string) {
  return render(
    <AuthProvider>
      <SoloCasUpload name={name} />
    </AuthProvider>,
  );
}

describe("SoloCasUpload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a self household member when none exists yet, then renders ImportFlow", async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([]);
    vi.mocked(api.createHouseholdMember).mockResolvedValue({
      id: "self-1", name: "Ayush", relationship: "self", relationship_other_label: null,
    });

    renderSolo("Ayush");

    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
    expect(api.createHouseholdMember).toHaveBeenCalledWith("Ayush", "self");
  });

  it("reuses an existing self household member instead of creating a duplicate", async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([
      { id: "self-1", name: "Ayush", relationship: "self", relationship_other_label: null },
    ]);

    renderSolo("Ayush");

    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
    expect(api.createHouseholdMember).not.toHaveBeenCalled();
  });

  it("falls back to a default name when none was given", async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([]);
    vi.mocked(api.createHouseholdMember).mockResolvedValue({
      id: "self-1", name: "Me", relationship: "self", relationship_other_label: null,
    });

    renderSolo("");

    await waitFor(() => expect(api.createHouseholdMember).toHaveBeenCalledWith("Me", "self"));
  });

  it("creates only one self household member under StrictMode's double-invoked mount effect", async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([]);
    vi.mocked(api.createHouseholdMember).mockResolvedValue({
      id: "self-1", name: "Ayush", relationship: "self", relationship_other_label: null,
    });

    render(
      <StrictMode>
        <AuthProvider>
          <SoloCasUpload name="Ayush" />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
    expect(api.createHouseholdMember).toHaveBeenCalledTimes(1);
  });
});
