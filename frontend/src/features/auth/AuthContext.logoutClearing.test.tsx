import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "./api";
import { clearToken, setToken } from "./session";
import type { MeResponse } from "./types";
import { clearSearchState } from "../../components/search/searchIndexStore";
import { pushRecentSearch, readRecentSearches } from "../../components/search/recentSearches";
import { invalidateApiCache } from "../../lib/apiClient";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn() };
});
// Keep the real behaviour, but count the calls.
vi.mock("../../components/search/searchIndexStore", async () => {
  const actual = await vi.importActual<typeof import("../../components/search/searchIndexStore")>("../../components/search/searchIndexStore");
  return { ...actual, clearSearchState: vi.fn(actual.clearSearchState) };
});
vi.mock("../../lib/apiClient", async () => {
  const actual = await vi.importActual<typeof import("../../lib/apiClient")>("../../lib/apiClient");
  return { ...actual, invalidateApiCache: vi.fn(actual.invalidateApiCache) };
});

const ME: MeResponse = {
  user_id: "u1", phone_number: "+919999999999", email: null, onboarding_step: "done", onboarding_completed: true,
  investor_type: null, primary_goals: null, self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};

afterEach(() => { vi.clearAllMocks(); clearToken(); window.history.replaceState(null, "", "/"); });

describe("logout clears what belongs to the signed-out person (Batch K, T04)", () => {
  it("logout clears search state and the GET cache", async () => {
    setToken("tok-1");
    vi.mocked(api.getMe).mockResolvedValue(ME);
    pushRecentSearch("u1", "hdfc");
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(readRecentSearches("u1")).toEqual(["hdfc"]);
    expect(clearSearchState).not.toHaveBeenCalled();
    act(() => result.current.logout());
    expect(clearSearchState).toHaveBeenCalledTimes(1);
    expect(invalidateApiCache).toHaveBeenCalledTimes(1);
    expect(readRecentSearches("u1")).toEqual([]);
    expect(result.current.me).toBeNull();
  });
  it("a second logout is harmless", async () => {
    setToken("tok-1");
    vi.mocked(api.getMe).mockResolvedValue(ME);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.logout());
    act(() => result.current.logout());
    expect(result.current.me).toBeNull();
  });
});
