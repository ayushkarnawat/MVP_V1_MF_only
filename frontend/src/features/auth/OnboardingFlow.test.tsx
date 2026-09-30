import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "./OnboardingFlow";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn() };
});

const BASE_ME: MeResponse = {
  user_id: "u1", phone_number: "+919999999999", email: null,
  onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goals: null,
};

function renderFlow() {
  vi.mocked(api.getMe).mockResolvedValue(BASE_ME);
  vi.mocked(api.updateMe).mockImplementation(async (body) => ({ ...BASE_ME, ...body }) as MeResponse);
  return render(
    <AuthProvider>
      <OnboardingFlow />
    </AuthProvider>,
  );
}

describe("OnboardingFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts at Name (Q1) and walks forward through Investing -> Goal -> Privacy/Trust -> CAS upload", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByLabelText(/full name as per pan/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/full name as per pan/i), { target: { value: "Ayush" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => expect(screen.getByText(/how are you investing right now/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /mostly on my own/i }));

    await waitFor(() => expect(screen.getByText(/what brings you to unifolio/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /consolidated portfolio view/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /we keep your insights, not your files\./i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    // continue from privacy page goes straight to upload: no household question
    await waitFor(() => expect(screen.getByText(/setting up your profile/i)).toBeInTheDocument());
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
});
