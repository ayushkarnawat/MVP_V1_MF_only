import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "./OnboardingFlow";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import * as importApi from "../import/api";
import { clearToken, setToken } from "./session";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), createHouseholdMember: vi.fn(), listHouseholdMembers: vi.fn(), updateMemberProfile: vi.fn() };
});
vi.mock("../import/api", async () => {
  const actual = await vi.importActual<typeof import("../import/api")>("../import/api");
  return { ...actual, getHouseholdImportHistory: vi.fn() };
});
// The import itself is ImportFlow's job; here it only needs to report success.
vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ onDone }: { onDone: () => void }) => <button type="button" onClick={onDone}>finish import</button>,
}));

const ME: MeResponse = {
  user_id: "u1", phone_number: "+919876543210", email: "asha@example.com",
  onboarding_step: "q2_investing", onboarding_completed: false, investor_type: null, primary_goals: null,
  self_name: "Asha Rao", consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};

function LoadedFlow() {
  const { loading } = useAuth();
  return loading ? null : <OnboardingFlow variant="split" />;
}
function renderFlow(me: MeResponse = ME) {
  setToken("t");
  vi.mocked(api.getMe).mockResolvedValue(me);
  vi.mocked(api.updateMe).mockImplementation(async (body) => ({ ...me, ...body }) as MeResponse);
  vi.mocked(api.listHouseholdMembers).mockResolvedValue([{ id: "self-1", relationship: "self", name: "Asha Rao" }] as never);
  vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([]);
  return render(<AuthProvider><LoadedFlow /></AuthProvider>);
}
const screen4 = () => screen.findByRole("heading", { level: 1, name: "How do you usually invest?" });
const screen5 = () => screen.findByRole("heading", { level: 1, name: "What would you like to connect first?" });
const screen6 = () => screen.findByRole("heading", { level: 1, name: "Getting your accounts ready" });
const completionCalls = () => vi.mocked(api.updateMe).mock.calls.filter(([body]) => (body as { onboarding_completed?: boolean }).onboarding_completed);
async function answerScreen4() {
  await screen4();
  fireEvent.click(screen.getByRole("radio", { name: /I manage my own investments/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Buy a home" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen5();
}
async function toScreen6() {
  await answerScreen4();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
  await screen6();
}

afterEach(() => {
  vi.clearAllMocks();
  clearToken();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("OnboardingFlow, split variant, screens 4 to 6 (UI round 2, S6 tasks 6.12 to 6.14)", () => {
  it("screen 4 saves the investor type and the goals in one updateMe call, then shows Connect accounts", async () => {
    renderFlow();
    await answerScreen4();
    const saves = vi.mocked(api.updateMe).mock.calls.filter(([body]) => "investor_type" in (body as object));
    expect(saves).toHaveLength(1);
    expect(saves[0][0]).toEqual({ investor_type: "self_directed", primary_goals: ["buy_home"], onboarding_step: "q2_investing" });
  });
  it("Back from screen 5 returns to screen 4 with the answers filled", async () => {
    renderFlow();
    await answerScreen4();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen4();
    expect(screen.getByRole("radio", { name: /I manage my own investments/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Buy a home" })).toHaveAttribute("aria-checked", "true");
  });
  it("Continue on screen 5 saves the step as cas_upload and shows today's import screens", async () => {
    renderFlow();
    await answerScreen4();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("button", { name: "finish import" })).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledWith({ onboarding_step: "cas_upload" });
    expect(screen.queryByRole("group", { name: /Step \d of 5/ })).toBeNull();
  });
  it("screens 5 and 6 are never saved as the onboarding step", async () => {
    renderFlow();
    await toScreen6();
    const saved = vi.mocked(api.updateMe).mock.calls.map(([body]) => (body as { onboarding_step?: string }).onboarding_step).filter(Boolean);
    expect(saved).not.toContain("connect_accounts");
    expect(saved).not.toContain("all_set");
  });
  it("All set shows after the import and before completion is written", async () => {
    renderFlow();
    await toScreen6();
    expect(completionCalls()).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Done" })).toBeInTheDocument();
  });
  it("there is no timed redirect on All set", async () => {
    renderFlow();
    await toScreen6();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(completionCalls()).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
  });
  it("Go to my dashboard writes onboarding_completed once and opens Home", async () => {
    renderFlow();
    await toScreen6();
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(completionCalls()).toHaveLength(1));
    expect(completionCalls()[0][0]).toEqual({ onboarding_completed: true });
    expect(window.location.pathname).toBe("/home");
  });
  it("View details completes onboarding and opens Import History", async () => {
    renderFlow();
    await toScreen6();
    fireEvent.click(screen.getByRole("button", { name: "View details ›" }));
    await waitFor(() => expect(completionCalls()).toHaveLength(1));
    expect(window.location.pathname).toBe("/profile/settings/import-history");
  });
  it("a failed completion shows the retry message, puts the address back and works on the next click", async () => {
    renderFlow();
    await toScreen6();
    vi.mocked(api.updateMe).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't finish setting up your account");
    expect(window.location.pathname).toBe("/");
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(completionCalls()).toHaveLength(2));
    expect(window.location.pathname).toBe("/home");
  });
});

describe("OnboardingFlow, split variant, resume (task 6.14)", () => {
  it("a saved cas_upload with a completed import resumes on All set", async () => {
    renderFlow({ ...ME, onboarding_step: "cas_upload" });
    vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([{ import_id: "i1", status: "import_successful" }] as never);
    await screen6();
  });
  it("a saved cas_upload with no completed import resumes on Connect accounts", async () => {
    renderFlow({ ...ME, onboarding_step: "cas_upload" });
    vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([{ import_id: "i1", status: "password_required" }] as never);
    await screen5();
  });
  it("if the import history cannot be read, resume is on Connect accounts", async () => {
    renderFlow({ ...ME, onboarding_step: "cas_upload" });
    vi.mocked(importApi.getHouseholdImportHistory).mockRejectedValue(new Error("offline"));
    await screen5();
  });
  it("the history is read only for a saved cas_upload", async () => {
    renderFlow();
    await screen4();
    expect(importApi.getHouseholdImportHistory).not.toHaveBeenCalled();
  });
  it("the old saved step q3_purpose resumes on screen 4 with the saved answers filled", async () => {
    renderFlow({ ...ME, onboarding_step: "q3_purpose", investor_type: "mixed", primary_goals: ["retirement"] });
    await screen4();
    expect(screen.getByRole("radio", { name: /A mix of both/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Plan for retirement" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("OnboardingFlow, split variant, Back from screen 4 (task 6.11)", () => {
  it("shows screen 3 with the saved name and email, editable; an unchanged Continue returns to screen 4 without requests", async () => {
    renderFlow();
    await screen4();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect((screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement).value).toBe("Asha Rao");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("asha@example.com");
    expect(screen.getByLabelText("Email address")).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen4();
    expect(api.updateMemberProfile).not.toHaveBeenCalled();
  });
  it("a changed name is saved and the answers on screen 4 are kept", async () => {
    renderFlow();
    await screen4();
    fireEvent.click(screen.getByRole("radio", { name: /A mix of both/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Create your account" });
    fireEvent.change(screen.getByLabelText("Full name (as per PAN card)"), { target: { value: "Asha Kumar" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen4();
    expect(api.updateMemberProfile).toHaveBeenCalledWith("self-1", { name: "Asha Kumar" });
  });
  it("Back on the return trip goes back to screen 4", async () => {
    renderFlow();
    await screen4();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Create your account" });
    fireEvent.click(within(screen.getByTestId("auth-topbar")).getByRole("button", { name: "Back" }));
    await screen4();
  });
});
