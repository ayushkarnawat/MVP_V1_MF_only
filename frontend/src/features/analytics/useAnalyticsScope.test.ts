import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalyticsScope } from "./useAnalyticsScope";
import * as api from "./api";

vi.mock("./api");

const settledSections = {
  allocation: { payload: { total_value: "100" }, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  ter: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  ter_direct_regular: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  benchmark: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  benchmark_funds: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  category_ranking: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
  score: { payload: {}, computed_at: "2026-09-01T00:00:00Z", failed_at: null },
};

const coldStartSections = {
  ...settledSections,
  score: { payload: null, computed_at: null, failed_at: null },
};

describe("useAnalyticsScope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does nothing and fetches nothing when scope is null", () => {
    const { result } = renderHook(() => useAnalyticsScope(null));
    expect(result.current.sections).toEqual({});
    expect(api.getAnalyticsScope).not.toHaveBeenCalled();
  });

  it("fetches once and stops polling once every section is settled and not recomputing", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: settledSections,
    });

    renderHook(() => useAnalyticsScope("combined"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });

  it("keeps polling every 3s while a section hasn't settled yet, then stops", async () => {
    vi.mocked(api.getAnalyticsScope)
      .mockResolvedValueOnce({ scope: "combined", recomputing: true, sections: coldStartSections })
      .mockResolvedValueOnce({ scope: "combined", recomputing: false, sections: settledSections });

    const { result } = renderHook(() => useAnalyticsScope("combined"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(result.current.recomputing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(2);
    expect(result.current.recomputing).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(2);
  });

  it("sets fetchError and stops polling on a rejected fetch", async () => {
    vi.mocked(api.getAnalyticsScope).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAnalyticsScope("combined"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.fetchError).toBe("boom");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });

  it("reports hasFailedSection when any section has failed_at set", async () => {
    const failedSections = {
      ...settledSections,
      score: { payload: null, computed_at: null, failed_at: "2026-09-01T00:00:00Z" },
    };
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: failedSections,
    });

    const { result } = renderHook(() => useAnalyticsScope("combined"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hasFailedSection).toBe(true);
  });

  it("restarts polling when retry() is called", async () => {
    const failedSections = {
      ...settledSections,
      score: { payload: null, computed_at: null, failed_at: "2026-09-01T00:00:00Z" },
    };
    vi.mocked(api.getAnalyticsScope)
      .mockResolvedValueOnce({ scope: "combined", recomputing: false, sections: failedSections })
      .mockResolvedValueOnce({ scope: "combined", recomputing: false, sections: settledSections });
    vi.mocked(api.retryAnalyticsScope).mockResolvedValue({ dispatched: true });

    const { result } = renderHook(() => useAnalyticsScope("combined"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retry();
    });
    expect(api.retryAnalyticsScope).toHaveBeenCalledWith("combined");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getAnalyticsScope).toHaveBeenCalledTimes(2);
  });

  it("aborts the in-flight request when the hook unmounts", async () => {
    let observedSignal: AbortSignal | undefined;
    vi.mocked(api.getAnalyticsScope).mockImplementation((_scope: string, signal?: AbortSignal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() => useAnalyticsScope("combined"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();

    expect(observedSignal?.aborted).toBe(true);
  });
});
