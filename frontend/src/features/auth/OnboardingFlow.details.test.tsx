import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "./OnboardingFlow";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import * as importApi from "../import/api";
import { clearToken, setToken } from "./session";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), createHouseholdMember: vi.fn(), listHouseholdMembers: vi.fn(), updateMemberProfile: vi.fn(), requestContactChange: vi.fn() };
});
vi.mock("../import/api", async () => {
  const actual = await vi.importActual<typeof import("../import/api")>("../import/api");
  return { ...actual, getHouseholdImportHistory: vi.fn() };
});
vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ onDone }: { onDone: () => void }) => <button type="button" onClick={onDone}>finish import</button>,
}));

const ME: MeResponse = {
  user_id: "u1", phone_number: "+919876543210", email: "asha@example.com",
  onboarding_step: "q2_investing", onboarding_completed: false, investor_type: null, primary_goals: null,
  self_name: "Asha Rao", consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};
const IMPORT = {
  import_id: "i1", household_member_id: "m1", uploaded_at: "2026-11-06T08:00:00Z", statement_from_date: "2016-01-01",
  statement_to_date: "2026-10-05", status: "confirmed", new_transactions_count: 289, upload_group_id: null, member_name: "ASHA RAO", group_people_count: 1,
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
const screen6 = () => screen.findByRole("heading", { level: 1, name: "Getting your accounts ready" });
const completionCalls = () => vi.mocked(api.updateMe).mock.calls.filter(([body]) => (body as { onboarding_completed?: boolean }).onboarding_completed);
async function toScreen6() {
  await screen.findByRole("heading", { level: 1, name: "How do you usually invest?" });
  fireEvent.click(screen.getByRole("radio", { name: /I manage my own investments/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Buy a home" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { level: 1, name: "What would you like to connect first?" });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
  await screen6();
  vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([IMPORT] as never);
}
const openDetails = () => fireEvent.click(screen.getByRole("button", { name: "View details ›" }));
const gone = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

beforeEach(() => { window.history.replaceState(null, "", "/"); });
afterEach(() => { vi.clearAllMocks(); clearToken(); sessionStorage.clear(); window.history.replaceState(null, "", "/"); });

describe("View details during sign-up stays on All set (QA fixes, B3)", () => {
  it("opens the import details over All set and does not save onboarding as complete", async () => {
    renderFlow();
    await toScreen6();
    openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Import details" });
    expect(await within(dialog).findByText("289 transactions · Imported")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
    expect(completionCalls()).toHaveLength(0);
    expect(window.location.pathname).toBe("/");
  });
  it("the Back button closes it and shows All set again, still not complete", async () => {
    renderFlow();
    await toScreen6();
    openDetails();
    fireEvent.click(await screen.findByRole("button", { name: /Back/ }));
    await gone();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
    expect(completionCalls()).toHaveLength(0);
    expect(window.location.pathname).toBe("/");
  });
  it("the browser's Back closes it the same way", async () => {
    renderFlow();
    await toScreen6();
    openDetails();
    await screen.findByRole("dialog", { name: "Import details" });
    act(() => { window.history.back(); });
    await gone();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
    expect(completionCalls()).toHaveLength(0);
  });
  it("Escape closes it too", async () => {
    renderFlow();
    await toScreen6();
    openDetails();
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await gone();
    expect(completionCalls()).toHaveLength(0);
  });
  it("it can be opened and closed again, one history entry each time, without stacking", async () => {
    renderFlow();
    await toScreen6();
    const start = window.history.length;
    openDetails();
    await screen.findByRole("dialog");
    expect(window.history.length).toBe(start + 1);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    await gone();
    openDetails();
    await screen.findByRole("dialog");
    act(() => { window.history.back(); });
    await gone();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Go to my dashboard, after looking at the details, saves completion once and opens Home", async () => {
    renderFlow();
    await toScreen6();
    openDetails();
    fireEvent.click(await screen.findByRole("button", { name: /Back/ }));
    await gone();
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(completionCalls()).toHaveLength(1));
    expect(completionCalls()[0][0]).toEqual({ onboarding_completed: true });
    expect(window.location.pathname).toBe("/home");
  });
  it("a failed save puts the address back, shows the retry message, and works on the next click", async () => {
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
  it("a reload while the details are open starts again on All set, not complete", async () => {
    renderFlow({ ...ME, onboarding_step: "cas_upload" });
    vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([{ import_id: "i1", status: "confirmed" }] as never);
    await screen6();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(completionCalls()).toHaveLength(0);
  });
});
