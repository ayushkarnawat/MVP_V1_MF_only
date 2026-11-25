import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { usePendingCamsRequest } from "./usePendingCamsRequest";

const pending = {
  import_id: "import-pending", household_member_id: "member-pending",
  expires_at: "2026-12-01T12:00:00Z",
};

describe("usePendingCamsRequest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads_the_waiting_request_for_the_member", async () => {
    let resolve!: (value: typeof pending) => void;
    const read = vi.spyOn(api, "getPendingCamsRequest").mockImplementation(
      () => new Promise((done) => { resolve = done; }),
    );
    const { result } = renderHook(() => usePendingCamsRequest("member-pending"));
    expect(result.current.status).toBe("loading");
    expect(result.current.request).toBeNull();
    expect(read).toHaveBeenCalledWith("member-pending");
    await act(async () => resolve(pending));
    expect(result.current.status).toBe("waiting");
    expect(result.current.request).toEqual(pending);
  });

  it("reports_none_when_nothing_waits", async () => {
    vi.spyOn(api, "getPendingCamsRequest").mockResolvedValue(null);
    const { result } = renderHook(() => usePendingCamsRequest("member-pending"));
    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(result.current.request).toBeNull();
  });

  it("refresh_reloads_it", async () => {
    const read = vi.spyOn(api, "getPendingCamsRequest")
      .mockResolvedValueOnce(pending).mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("Read failed"));
    const { result } = renderHook(() => usePendingCamsRequest("member-pending"));
    await waitFor(() => expect(result.current.status).toBe("waiting"));
    await act(async () => result.current.refresh());
    expect(result.current.status).toBe("none");
    expect(result.current.request).toBeNull();
    await act(async () => result.current.refresh());
    expect(result.current.status).toBe("error");
    expect(result.current.request).toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
  });
});
