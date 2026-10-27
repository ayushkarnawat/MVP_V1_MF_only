import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deferred } from "./__support__/deferred";
import type { Unavailable } from "./types";
import { useFundSection } from "./useFundSection";

interface Body { status: "ready"; value: string }
const ready = (value: string): Body => ({ status: "ready", value });

describe("useFundSection", () => {
  it("starts loading, then is ready with the data", async () => {
    const fetcher = vi.fn().mockResolvedValue(ready("a"));
    const { result } = renderHook(() => useFundSection<Body>(fetcher, ["x"]));
    expect(result.current).toMatchObject({ status: "loading", data: null, reason: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual(ready("a"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("an unavailable payload sets the status and the reason, with no data", async () => {
    const body: Unavailable = { status: "unavailable", reason: "no_history" };
    const { result } = renderHook(() => useFundSection<Body>(() => Promise.resolve(body), ["x"]));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current).toMatchObject({ data: null, reason: "no_history" });
  });

  it("a rejection sets the error status and keeps the error", async () => {
    const failure = new Error("boom");
    const { result } = renderHook(() => useFundSection<Body>(() => Promise.reject(failure), ["x"]));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeNull();
  });

  it("a dependency change shows loading with no stale data at once", async () => {
    const { result, rerender } = renderHook(({ dep }) => useFundSection<Body>(() => Promise.resolve(ready(dep)), [dep]), { initialProps: { dep: "a" } });
    await waitFor(() => expect(result.current.data).toEqual(ready("a")));
    rerender({ dep: "b" });
    expect(result.current).toMatchObject({ status: "loading", data: null });
    await waitFor(() => expect(result.current.data).toEqual(ready("b")));
  });

  it("test_ignores_stale_response_after_deps_change: the first answer arriving last does not overwrite the second", async () => {
    const first = deferred<Body>();
    const second = deferred<Body>();
    const { result, rerender } = renderHook(
      ({ dep }) => useFundSection<Body>(() => (dep === "a" ? first.promise : second.promise), [dep]),
      { initialProps: { dep: "a" } },
    );
    rerender({ dep: "b" });
    await act(async () => { second.resolve(ready("second")); });
    await act(async () => { first.resolve(ready("first")); });
    expect(result.current.data).toEqual(ready("second"));
  });

  it("a late failure of an earlier request does not replace the newer data", async () => {
    const first = deferred<Body>();
    const { result, rerender } = renderHook(
      ({ dep }) => useFundSection<Body>(() => (dep === "a" ? first.promise : Promise.resolve(ready("second"))), [dep]),
      { initialProps: { dep: "a" } },
    );
    rerender({ dep: "b" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { first.reject(new Error("late")); });
    expect(result.current.status).toBe("ready");
  });

  it("test_aborts_on_unmount and on a dependency change", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = (signal: AbortSignal) => { signals.push(signal); return new Promise<Body>(() => {}); };
    const { rerender, unmount } = renderHook(({ dep }) => useFundSection<Body>(fetcher, [dep]), { initialProps: { dep: "a" } });
    rerender({ dep: "b" });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("an AbortError after unmount is swallowed", async () => {
    const pending = deferred<Body>();
    const { result, unmount } = renderHook(() => useFundSection<Body>(() => pending.promise, ["x"]));
    unmount();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await act(async () => { pending.reject(abort); });
    expect(result.current.status).toBe("loading");
  });

  it("an equal dependency list on rerender does not refetch", async () => {
    const fetcher = vi.fn().mockResolvedValue(ready("a"));
    const { rerender } = renderHook(({ deps }) => useFundSection<Body>(fetcher, deps), { initialProps: { deps: ["a", 1] } });
    rerender({ deps: ["a", 1] });
    rerender({ deps: ["a", 1] });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  it("test_retry_refetches: retry goes back to loading and fetches again", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(ready("ok"));
    const { result } = renderHook(() => useFundSection<Body>(fetcher, ["x"]));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("enabled false waits without fetching, then fetches once when switched on and keeps the result", async () => {
    const fetcher = vi.fn().mockResolvedValue(ready("a"));
    const { result, rerender } = renderHook(({ enabled }) => useFundSection<Body>(fetcher, ["x"], { enabled }), { initialProps: { enabled: false } });
    expect(result.current.status).toBe("loading");
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(ready("a"));
  });

  it("passes an abort signal to the fetcher and does not refetch just because the fetcher is a new closure", async () => {
    const seen: unknown[] = [];
    const { rerender } = renderHook(({ tag }) => useFundSection<Body>(signal => { seen.push([tag, signal instanceof AbortSignal]); return Promise.resolve(ready(tag)); }, ["x"]), { initialProps: { tag: "old" } });
    rerender({ tag: "new" });
    await waitFor(() => expect(seen).toEqual([["old", true]]));
  });
});
