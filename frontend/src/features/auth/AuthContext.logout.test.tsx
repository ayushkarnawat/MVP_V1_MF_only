import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";
import { clearToken, getToken, setToken } from "./session";
import type { MeResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn() };
});

const ME: MeResponse = {
  user_id: "u1", phone_number: "+919999999999", email: null, onboarding_step: "done", onboarding_completed: true,
  investor_type: null, primary_goals: null, self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};
const at = (url: string) => window.history.replaceState(null, "", url);
async function signedIn() {
  setToken("tok-1");
  vi.mocked(api.getMe).mockResolvedValue(ME);
  const view = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => at("/"));
afterEach(() => { vi.clearAllMocks(); clearToken(); at("/"); });

describe("logging out sends the next login to Home (QA fixes, B2)", () => {
  it("a manual logout from a Profile page resets the address to the root, so the root redirect opens Home", async () => {
    const { result } = await signedIn();
    at("/profile/family");
    act(() => result.current.logout());
    expect(window.location.pathname).toBe("/");
    expect(result.current.me).toBeNull();
    expect(getToken()).toBeNull();
  });
  it("drops the query and the hash too", async () => {
    const { result } = await signedIn();
    at("/portfolio/mutual-funds?sort=value#holdings");
    act(() => result.current.logout());
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/");
  });
  it("replaces the entry instead of adding one, so Back does not return to the page that was signed out of", async () => {
    const { result } = await signedIn();
    at("/profile/family");
    const before = window.history.length;
    act(() => result.current.logout());
    expect(window.history.length).toBe(before);
  });
  it("does not touch the address on the mobile paths", async () => {
    const { result } = await signedIn();
    at("/mobile/portfolio");
    act(() => result.current.logout());
    expect(window.location.pathname).toBe("/mobile/portfolio");
    at("/#/mobile/home");
    act(() => result.current.logout());
    expect(window.location.hash).toBe("#/mobile/home");
  });
  it("a second logout is harmless", async () => {
    const { result } = await signedIn();
    at("/profile/family");
    act(() => result.current.logout());
    act(() => result.current.logout());
    expect(window.location.pathname).toBe("/");
  });
});

describe("a deep link and an expired session still keep their address (QA fixes, B2)", () => {
  it("an expired session found on load keeps the address, so the person comes back to that page after login", async () => {
    at("/profile/family");
    setToken("stale-tok");
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(401, "Invalid or expired session."));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.me).toBeNull();
    expect(window.location.pathname).toBe("/profile/family");
  });
  it("a page opened directly while signed out keeps its address, and so does the login that follows", async () => {
    at("/portfolio/mutual-funds/holdings");
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(window.location.pathname).toBe("/portfolio/mutual-funds/holdings");
    vi.mocked(api.getMe).mockResolvedValue(ME);
    await act(async () => { await result.current.login("new-tok"); });
    expect(window.location.pathname).toBe("/portfolio/mutual-funds/holdings");
  });
});
