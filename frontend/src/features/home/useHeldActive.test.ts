import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHeldActive } from "./useHeldActive";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useHeldActive (QA fixes, A2)", () => {
  it("starts with nothing active and sets the key on enter", () => {
    const { result } = renderHook(() => useHeldActive());
    expect(result.current.active).toBeNull();
    act(() => result.current.enter("equity"));
    expect(result.current.active).toBe("equity");
  });
  it("holds the highlight for 90 ms after the pointer leaves, then clears it", () => {
    const { result } = renderHook(() => useHeldActive());
    act(() => result.current.enter("equity"));
    act(() => result.current.leave());
    act(() => { vi.advanceTimersByTime(89); });
    expect(result.current.active).toBe("equity");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.active).toBeNull();
  });
  it("entering the next slice inside the hold switches straight to it and cancels the clear", () => {
    const { result } = renderHook(() => useHeldActive());
    act(() => result.current.enter("equity"));
    act(() => result.current.leave());
    act(() => { vi.advanceTimersByTime(40); });
    act(() => result.current.enter("debt"));
    expect(result.current.active).toBe("debt");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.active).toBe("debt");
  });
  it("takes its own hold time", () => {
    const { result } = renderHook(() => useHeldActive(300));
    act(() => result.current.enter("equity"));
    act(() => result.current.leave());
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current.active).toBe("equity");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.active).toBeNull();
  });
  it("clearNow clears at once and cancels a pending clear", () => {
    const { result } = renderHook(() => useHeldActive());
    act(() => result.current.enter("equity"));
    act(() => result.current.leave());
    act(() => result.current.clearNow());
    expect(result.current.active).toBeNull();
    act(() => result.current.enter("gold"));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.active).toBe("gold");
  });
  it("gives enter, leave and clearNow the same identity on every render, so memoised children do not redraw", () => {
    const { result, rerender } = renderHook(() => useHeldActive());
    const first = { enter: result.current.enter, leave: result.current.leave, clearNow: result.current.clearNow };
    act(() => result.current.enter("equity"));
    rerender();
    expect(result.current.enter).toBe(first.enter);
    expect(result.current.leave).toBe(first.leave);
    expect(result.current.clearNow).toBe(first.clearNow);
  });
  it("leaves no timer running after it is unmounted", () => {
    const { result, unmount } = renderHook(() => useHeldActive());
    act(() => result.current.enter("equity"));
    act(() => result.current.leave());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
