import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  user_id: "u1",
  phone_number: "+919999999999",
  email: null,
  onboarding_step: "q2_investing",
  onboarding_completed: false,
  investor_type: null,
  primary_goal: null,
};

describe("AuthContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearToken();
  });

  it("resolves loading=false with no session when no token is stored", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token).toBeNull();
    expect(result.current.me).toBeNull();
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it("resolves with me populated when a valid token is stored", async () => {
    setToken("tok-1");
    vi.mocked(api.getMe).mockResolvedValue(ME);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token).toBe("tok-1");
    expect(result.current.me).toEqual(ME);
  });

  it("clears the stored token when resume gets a 401", async () => {
    setToken("stale-tok");
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(401, "Invalid or expired session."));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token).toBeNull();
    expect(result.current.me).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("login stores the token and populates me", async () => {
    vi.mocked(api.getMe).mockResolvedValue(ME);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("new-tok");
    });

    expect(result.current.token).toBe("new-tok");
    expect(result.current.me).toEqual(ME);
    expect(getToken()).toBe("new-tok");
  });

  it("logout clears the token and me", async () => {
    setToken("tok-1");
    vi.mocked(api.getMe).mockResolvedValue(ME);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.me).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("updateMe calls the API and syncs the returned me into context", async () => {
    setToken("tok-1");
    vi.mocked(api.getMe).mockResolvedValue(ME);
    const updated = { ...ME, onboarding_step: "q3_purpose" };
    vi.mocked(api.updateMe).mockResolvedValue(updated);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateMe({ onboarding_step: "q3_purpose" });
    });

    expect(api.updateMe).toHaveBeenCalledWith({ onboarding_step: "q3_purpose" });
    expect(result.current.me?.onboarding_step).toBe("q3_purpose");
  });
});
