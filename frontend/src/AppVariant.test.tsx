import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./features/auth/api";

const seen = vi.hoisted(() => ({ entry: null as null | Record<string, unknown>, onboarding: null as null | Record<string, unknown> }));
vi.mock("./features/auth/AuthEntryFlow", () => ({
  AuthEntryFlow: (props: Record<string, unknown>) => { seen.entry = props; return <div data-testid="entry-flow" />; },
}));
vi.mock("./features/auth/OnboardingFlow", () => ({
  OnboardingFlow: (props: Record<string, unknown>) => { seen.onboarding = props; return <div data-testid="onboarding-flow" />; },
}));
vi.mock("./features/auth/api", async () => {
  const actual = await vi.importActual<typeof import("./features/auth/api")>("./features/auth/api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), listHouseholdMembers: vi.fn().mockResolvedValue([]), getHouseholdMembers: vi.fn().mockResolvedValue([]) };
});
vi.mock("./features/home/HomePage", () => ({ default: () => <h1>Home</h1> }));

const incomplete = {
  user_id: "u-1", email: "a@b.co", phone_number: "+919876543210", onboarding_step: "q1_name", onboarding_completed: false,
  investor_type: null, primary_goals: null, self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};

afterEach(() => { vi.clearAllMocks(); localStorage.clear(); seen.entry = null; seen.onboarding = null; });

describe("App passes the auth variant (UI round 2, S6 task 6.2)", () => {
  it("desktop without a session: AuthEntryFlow gets split", async () => {
    render(<App />);
    await screen.findByTestId("entry-flow");
    expect(seen.entry).toMatchObject({ variant: "split" });
  });
  it("desktop with an unfinished onboarding: OnboardingFlow gets split and isMobile false", async () => {
    localStorage.setItem("unifolio_session_token", "tok-1");
    vi.mocked(api.getMe).mockResolvedValue(incomplete as never);
    render(<App />);
    await screen.findByTestId("onboarding-flow");
    expect(seen.onboarding).toMatchObject({ variant: "split", isMobile: false });
  });
  it("mobile with an unfinished onboarding: OnboardingFlow keeps legacy", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("767px"), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      localStorage.setItem("unifolio_session_token", "tok-1");
      vi.mocked(api.getMe).mockResolvedValue(incomplete as never);
      render(<App />);
      await waitFor(() => expect(seen.onboarding).not.toBeNull());
      expect(seen.onboarding).toMatchObject({ variant: "legacy", isMobile: true });
    } finally {
      window.matchMedia = original;
    }
  });
});
