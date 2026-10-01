import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow, resumeStep } from "./OnboardingFlow";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import { clearToken, setToken } from "./session";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), createHouseholdMember: vi.fn() };
});

const BASE_ME: MeResponse = {
  user_id: "u1", phone_number: "+919999999999", email: null,
  onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goals: null,
  self_name: null, consent_outdated: [],
};

// App.tsx mounts the flow only once /auth/me has loaded; mirror that so the
// resume initialisers see the real `me`.
function LoadedFlow() {
  const { loading } = useAuth();
  return loading ? null : <OnboardingFlow />;
}

function renderFlow(me: MeResponse = BASE_ME) {
  vi.mocked(api.getMe).mockResolvedValue(me);
  vi.mocked(api.updateMe).mockImplementation(async (body) => ({ ...me, ...body }) as MeResponse);
  vi.mocked(api.createHouseholdMember).mockImplementation(async (name) => ({
    id: "self-1", name, relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false,
  }));
  return render(
    <AuthProvider>
      <LoadedFlow />
    </AuthProvider>,
  );
}

describe("OnboardingFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearToken();
  });

  it("starts at Name (Q1) and walks forward through Investing -> Goal -> CAS upload (no privacy screen)", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByLabelText(/full name as per pan/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => expect(screen.getByText(/how are you investing right now/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /mostly on my own/i }));

    await waitFor(() => expect(screen.getByText(/what brings you to unifolio/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /consolidated portfolio view/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Q3 Continue goes straight to upload: no privacy screen, no household question
    await waitFor(() => expect(screen.getByText(/setting up your profile/i)).toBeInTheDocument());
    expect(screen.queryByText(/not your files/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/just me/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/just you, or tracking for family too/i)).not.toBeInTheDocument();
  });

  it("supports Back navigation from Q2 to Q1 with the answer preserved", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    await waitFor(() => expect(screen.getByLabelText(/full name as per pan/i)).toHaveValue("Ayush"));
  });

  it("does not render a skip button on the Name (Q1) screen", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    expect(screen.queryByRole("button", { name: /^skip$/i })).not.toBeInTheDocument();
  });

  it("skipping Q2 still allows reaching it again via Back later", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));

    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    await waitFor(() => expect(screen.getByText(/what brings you to unifolio/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/how are you investing right now/i)).toBeInTheDocument());
  });

  it("persists the Q2 answer to the backend via updateMe", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));

    fireEvent.click(screen.getByRole("button", { name: /mostly on my own/i }));

    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith(expect.objectContaining({ investor_type: "self_directed" })),
    );
  });

  async function goToQ3() {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));
    fireEvent.click(screen.getByRole("button", { name: /mostly on my own/i }));
    await waitFor(() => screen.getByText(/what brings you to unifolio/i));
  }

  it("Q3 lets the user pick several goals and saves them on Continue", async () => {
    await goToQ3();
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Consolidated portfolio view/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Family wealth tracking/ }));
    expect(screen.getByRole("checkbox", { name: /Family wealth tracking/ })).toHaveAttribute("aria-checked", "true");
    expect(api.updateMe).not.toHaveBeenCalledWith(expect.objectContaining({ primary_goals: expect.anything() }));
    fireEvent.click(cont);
    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ primary_goals: ["consolidated_view", "family_management"] }),
    );
  });

  it("Q3 toggling an option twice unselects it", async () => {
    await goToQ3();
    const opt = screen.getByRole("checkbox", { name: /Compare distributor fees/ });
    fireEvent.click(opt);
    fireEvent.click(opt);
    expect(opt).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("name step saves the self member before moving on", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Asha Rao" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));
    expect(api.createHouseholdMember).toHaveBeenCalledWith("Asha Rao", "self");
  });

  it("stays on the name step and shows an alert when saving the name fails", async () => {
    renderFlow();
    vi.mocked(api.createHouseholdMember).mockRejectedValue(new Error("boom"));
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Asha Rao" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/how are you investing right now/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("back to the name step and changing it renames via a second create call", async () => {
    renderFlow();
    await waitFor(() => screen.getByLabelText(/full name as per pan/i));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ravi" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => screen.getByText(/how are you investing right now/i));
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByLabelText(/full name as per pan/i)).toHaveValue("Ravi"));
    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ravi Kumar" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => expect(api.createHouseholdMember).toHaveBeenLastCalledWith("Ravi Kumar", "self"));
    expect(api.createHouseholdMember).toHaveBeenCalledTimes(2);
  });

  it("resumed questions show the saved answers", async () => {
    setToken("t"); // AuthProvider only loads /auth/me when a token is stored
    renderFlow({ ...BASE_ME, onboarding_step: "q2_investing", self_name: "Asha", investor_type: "self_directed" });
    await waitFor(() => screen.getByText(/how are you investing right now/i));
    expect(screen.getByRole("button", { name: /mostly on my own/i })).toHaveClass("bg-[#22C55E]/[0.08]");
    expect(screen.getByRole("button", { name: /^through an advisor/i })).not.toHaveClass("bg-[#22C55E]/[0.08]");
  });
});

const baseMe: MeResponse = {
  user_id: "u", phone_number: "+91", email: null, onboarding_completed: false, onboarding_step: null,
  investor_type: null, primary_goals: null, pending_deletion: false, deletion_scheduled_at: null, self_name: null, consent_outdated: [],
};

describe("resumeStep", () => {
  it("trust_primer with nothing saved goes to the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer" })).toBe("q1_name");
  });
  it("trust_primer with only a name goes to investing", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha" })).toBe("q2_investing");
  });
  it("trust_primer with name and investing goes to the goal question", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha", investor_type: "self_directed" })).toBe("q3_purpose");
  });
  it("trust_primer with everything saved goes to upload", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha", investor_type: "self_directed", primary_goals: ["family_management"] })).toBe("cas_upload");
  });
  it("any step past the name without a saved name goes back to the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "cas_upload" })).toBe("q1_name");
    expect(resumeStep({ ...baseMe, onboarding_step: "q3_purpose" })).toBe("q1_name");
  });
  it("a normal step with a saved name is kept, even if a skipped answer is null", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "cas_upload", self_name: "Asha" })).toBe("cas_upload");
  });
  it("no step starts at the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: null })).toBe("q1_name");
  });
});
