import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePortfolioSection } from "./usePortfolioSection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("usePortfolioSection", () => {
  it("starts loading, then returns the data", async () => {
    const load = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => usePortfolioSection(load, ["a"]));
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it("reports an error, and retry loads again", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ n: 2 });
    const { result } = renderHook(() => usePortfolioSection(load, ["a"]));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect((result.current.error as Error).message).toBe("boom");
    expect(result.current.data).toBeNull();

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data).toEqual({ n: 2 });
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts the earlier request when the dependencies change, and ignores its late answer", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const { result, rerender } = renderHook(({ scope }) => usePortfolioSection(load, [scope]), {
      initialProps: { scope: "aggregate" },
    });
    expect(signals).toHaveLength(1);

    rerender({ scope: "member:1" });
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => { second.resolve("second"); });
    await waitFor(() => expect(result.current.data).toBe("second"));
    await act(async () => { first.resolve("first"); });
    expect(result.current.data).toBe("second");
    expect(result.current.status).toBe("data");
  });

  it("shows loading with no data (not the old numbers) while a new scope loads", async () => {
    const second = deferred<string>();
    const load = vi.fn().mockResolvedValueOnce("first").mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ scope }) => usePortfolioSection(load, [scope]), {
      initialProps: { scope: "aggregate" },
    });
    await waitFor(() => expect(result.current.data).toBe("first"));
    rerender({ scope: "member:1" });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    await act(async () => { second.resolve("second"); });
    await waitFor(() => expect(result.current.data).toBe("second"));
  });

  it("does not reload when the dependencies are equal", async () => {
    const load = vi.fn().mockResolvedValue("x");
    const { result, rerender } = renderHook(({ scope }) => usePortfolioSection(load, [scope, "1M"]), {
      initialProps: { scope: "aggregate" },
    });
    await waitFor(() => expect(result.current.status).toBe("data"));
    rerender({ scope: "aggregate" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("aborts on unmount", async () => {
    const pending = deferred<string>();
    let seen: AbortSignal | undefined;
    const load = vi.fn((signal: AbortSignal) => { seen = signal; return pending.promise; });
    const { unmount } = renderHook(() => usePortfolioSection(load, ["a"]));
    expect(seen?.aborted).toBe(false);
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it("ignores an ordinary error that arrives after the request was aborted", async () => {
    const first = deferred<string>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce("second");
    const { result, rerender } = renderHook(({ scope }) => usePortfolioSection(load, [scope]), {
      initialProps: { scope: "a" },
    });
    rerender({ scope: "b" });
    await waitFor(() => expect(result.current.data).toBe("second"));
    await act(async () => { first.reject(new Error("late failure")); });
    expect(result.current.status).toBe("data");
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("second");
  });

  it("does not report an error for a request that was aborted", async () => {
    const first = deferred<string>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce("second");
    const { result, rerender } = renderHook(({ scope }) => usePortfolioSection(load, [scope]), {
      initialProps: { scope: "a" },
    });
    rerender({ scope: "b" });
    await act(async () => { first.reject(new DOMException("aborted", "AbortError")); });
    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(result.current.status).toBe("data");
    expect(result.current.error).toBeNull();
  });
});
