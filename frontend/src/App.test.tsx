import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./features/auth/api";

// updateMe is mocked too (deviation from the task brief): OnboardingFlow's mount
// effect fires updateMe, and an unmocked real fetch fails the run as an
// unhandled rejection — same pattern as OnboardingFlow.test.tsx.
vi.mock("./features/auth/api", async () => {
  const actual = await vi.importActual<typeof import("./features/auth/api")>("./features/auth/api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), listHouseholdMembers: vi.fn().mockResolvedValue([]) };
});

describe("App", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows Landing when there is no stored session on desktop viewport", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());
  });

  it("shows MobileLandingPage when there is no stored session on mobile viewport and transitions to AuthEntryFlow", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("767px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Scattered")).toBeInTheDocument();
      expect(screen.getByText(/holdings, one clear picture/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    });

    window.matchMedia = originalMatchMedia;
  });

  it("shows OnboardingFlow when the session is valid and onboarding is incomplete", async () => {
    localStorage.setItem("unifolio_session_token", "tok-1");
    const incompleteMe = {
      user_id: "u1", phone_number: "+919999999999", email: null,
      onboarding_step: "q1_name", onboarding_completed: false, investor_type: null, primary_goal: null,
    };
    vi.mocked(api.getMe).mockResolvedValue(incompleteMe);
    vi.mocked(api.updateMe).mockResolvedValue(incompleteMe);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText(/your full name or first name/i)).toBeInTheDocument());
  });

  it("shows DashboardPlaceholder when the session is valid and onboarding is complete on desktop viewport", async () => {
    localStorage.setItem("unifolio_session_token", "tok-1");
    vi.mocked(api.getMe).mockResolvedValue({
      user_id: "u1", phone_number: "+919999999999", email: null,
      onboarding_step: null, onboarding_completed: true, investor_type: null, primary_goal: null,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText(/welcome to unifolio/i)).toBeInTheDocument());
  });

  it("shows MobileRoot when the session is valid and viewport is mobile (< 768px)", async () => {
    localStorage.setItem("unifolio_session_token", "tok-1");
    vi.mocked(api.getMe).mockResolvedValue({
      user_id: "u1", phone_number: "+919999999999", email: null,
      onboarding_step: null, onboarding_completed: true, investor_type: null, primary_goal: null,
    });

    // Mock mobile matchMedia
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("767px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /mobile navigation/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /analytics/i })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Holdings" })).not.toBeInTheDocument();
    });

    window.matchMedia = originalMatchMedia;
  });

  it("falls back to Landing when the stored session is invalid", async () => {
    localStorage.setItem("unifolio_session_token", "stale-tok");
    vi.mocked(api.getMe).mockRejectedValue(new Error("401"));

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());
  });
});
