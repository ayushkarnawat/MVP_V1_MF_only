import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "./OnboardingFlow";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import { clearToken, setToken } from "./session";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), createHouseholdMember: vi.fn(), listHouseholdMembers: vi.fn() };
});

const PHONE = "+919876543210";
const ME: MeResponse = {
  user_id: "u1", phone_number: PHONE, email: "asha@example.com",
  onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goals: null,
  self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};
const SELF = (name: string) => ({
  id: "self-1", name, relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null,
  name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false,
});
const store = (name: string, phone = PHONE) => sessionStorage.setItem("unifolio.pendingSignup", JSON.stringify({ name, phone }));

function LoadedFlow({ variant }: { variant: "split" | "legacy" }) {
  const { loading } = useAuth();
  return loading ? null : <OnboardingFlow variant={variant} />;
}
function renderFlow(over: { me?: MeResponse; variant?: "split" | "legacy"; strict?: boolean; members?: ReturnType<typeof SELF>[] } = {}) {
  const me = over.me ?? ME;
  setToken("t"); // AuthProvider only loads /auth/me when a token is stored
  vi.mocked(api.getMe).mockResolvedValue(me);
  vi.mocked(api.updateMe).mockImplementation(async (body) => ({ ...me, ...body }) as MeResponse);
  vi.mocked(api.listHouseholdMembers).mockResolvedValue((over.members ?? []) as never);
  vi.mocked(api.createHouseholdMember).mockImplementation(async (name) => SELF(name) as never);
  const tree = <AuthProvider><LoadedFlow variant={over.variant ?? "split"} /></AuthProvider>;
  return render(over.strict ? <StrictMode>{tree}</StrictMode> : tree);
}
const investing = () => screen.findByText(/how are you investing right now/i);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearToken();
  sessionStorage.clear();
});

describe("OnboardingFlow, split variant: the sign-up name hand-over (UI round 2, S6 task 6.10)", () => {
  it("creates the self member once from the stored name, clears the store and moves on to the investing question", async () => {
    store("Asha Rao");
    renderFlow();
    expect(await investing()).toBeInTheDocument();
    expect(api.createHouseholdMember).toHaveBeenCalledTimes(1);
    expect(api.createHouseholdMember).toHaveBeenCalledWith("Asha Rao", "self");
    expect(sessionStorage.getItem("unifolio.pendingSignup")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Create your account" })).toBeNull();
  });
  it("a double mount (StrictMode) still creates one self member", async () => {
    store("Asha Rao");
    renderFlow({ strict: true });
    expect(await investing()).toBeInTheDocument();
    expect(api.createHouseholdMember).toHaveBeenCalledTimes(1);
  });
  it("an existing self member is reused, not created again", async () => {
    store("Asha Rao");
    renderFlow({ members: [SELF("Asha Rao")] });
    expect(await investing()).toBeInTheDocument();
    expect(api.createHouseholdMember).not.toHaveBeenCalled();
  });
  it("a stored name for another phone number is ignored and cleared; the name screen is shown instead", async () => {
    store("Someone Else", "+919000000000");
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(api.createHouseholdMember).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("unifolio.pendingSignup")).toBeNull();
    expect((screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement).value).toBe("");
  });
  it("nothing stored (a refresh after the code): only the name is asked, the verified email is read-only", async () => {
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    const emailField = screen.getByLabelText("Email address") as HTMLInputElement;
    expect(emailField.value).toBe("asha@example.com");
    expect(emailField).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Full name (as per PAN card)"), { target: { value: "Asha Rao" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await investing()).toBeInTheDocument();
    expect(api.createHouseholdMember).toHaveBeenCalledWith("Asha Rao", "self");
  });
  it("sessionStorage failing does not break the screen", async () => {
    const blocked = () => { throw new Error("blocked"); };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked });
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });
  it("if saving the stored name fails, the name screen shows it filled with an error and the store is kept", async () => {
    store("Asha Rao");
    renderFlow();
    vi.mocked(api.createHouseholdMember).mockRejectedValueOnce(new Error("boom"));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your name. Try again.");
    expect((screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement).value).toBe("Asha Rao");
    expect(sessionStorage.getItem("unifolio.pendingSignup")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await investing()).toBeInTheDocument();
  });
  it("the legacy variant ignores the stored name and shows today's name screen", async () => {
    store("Asha Rao");
    renderFlow({ variant: "legacy" });
    await waitFor(() => expect(screen.getByLabelText(/full name as per pan/i)).toBeInTheDocument());
    expect(api.createHouseholdMember).not.toHaveBeenCalled();
  });
  it("past the name step nothing is handed over", async () => {
    store("Asha Rao");
    renderFlow({ me: { ...ME, onboarding_step: "q2_investing", self_name: "Asha Rao" } });
    expect(await investing()).toBeInTheDocument();
    expect(api.createHouseholdMember).not.toHaveBeenCalled();
  });
});
