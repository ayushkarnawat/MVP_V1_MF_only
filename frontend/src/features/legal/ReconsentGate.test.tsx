import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "../auth/types";
import { DOCS } from "./testFixtures";
import { ReconsentGate } from "./ReconsentGate";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  refreshMe: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    getLegalDocuments: vi.fn(async () => DOCS),
    submitReconsent: vi.fn(async () => ({ consent_outdated: [] })),
  };
});

const BASE_ME: MeResponse = {
  user_id: "u-1",
  phone_number: "+919876543210",
  email: "aditi@example.in",
  onboarding_step: null,
  onboarding_completed: true,
  investor_type: "mixed",
  primary_goals: ["childrens_education"],
  self_name: "Aditi Surve",
  consent_outdated: ["terms_of_service", "privacy_policy"],
  created_at: "2025-10-14T09:30:00+05:30",
};

describe("ReconsentGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.me = BASE_ME;
  });

  it("reconsent_gate_uses_head_change_wording", async () => {
    auth.me = {
      ...BASE_ME,
      consent_outdated_reason: "head_change",
    };

    render(
      <ReconsentGate>
        <div>Dashboard content</div>
      </ReconsentGate>,
    );

    expect(await screen.findByText("You are now the Head of Family")).toBeInTheDocument();
    expect(
      screen.getByText("Please review and agree to continue using Unifolio as the Head of Family."),
    ).toBeInTheDocument();
    expect(screen.queryByText("We’ve updated our Terms")).not.toBeInTheDocument();
  });

  it("keeps the default updated-terms wording when consent_outdated_reason is null or absent", async () => {
    auth.me = {
      ...BASE_ME,
      consent_outdated_reason: null,
    };

    render(
      <ReconsentGate>
        <div>Dashboard content</div>
      </ReconsentGate>,
    );

    expect(await screen.findByText("We’ve updated our Terms")).toBeInTheDocument();
    expect(screen.getByText("Please review and agree to continue using Unifolio.")).toBeInTheDocument();
    expect(screen.queryByText("You are now the Head of Family")).not.toBeInTheDocument();
  });
});
