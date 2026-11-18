import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMmSs, useResendCountdown } from "./useResendCountdown";

describe("useResendCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts from the given seconds and counts down once a second, stopping at zero", () => {
    const { result } = renderHook(() => useResendCountdown(3));
    expect(result.current).toMatchObject({ seconds: 3, active: true });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.seconds).toBe(2);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toMatchObject({ seconds: 0, active: false });
  });

  it("restart() with no argument goes back to the starting value", () => {
    const { result } = renderHook(() => useResendCountdown(60));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.seconds).toBe(50);
    act(() => result.current.restart());
    expect(result.current.seconds).toBe(60);
  });

  it("restart(next) starts from the number the server gave, and runs again after reaching zero", () => {
    const { result } = renderHook(() => useResendCountdown(2));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.active).toBe(false);
    act(() => result.current.restart(42));
    expect(result.current).toMatchObject({ seconds: 42, active: true });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.seconds).toBe(40);
  });

  it("restart(0) leaves it stopped and never goes below zero", () => {
    const { result } = renderHook(() => useResendCountdown(5));
    act(() => result.current.restart(0));
    expect(result.current).toMatchObject({ seconds: 0, active: false });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.seconds).toBe(0);
  });

  it("clears its timer when the screen closes", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useResendCountdown(30));
    unmount();
    expect(clear).toHaveBeenCalled();
  });

  it("formatMmSs shows minutes and seconds with two digits", () => {
    expect(formatMmSs(42)).toBe("00:42");
    expect(formatMmSs(60)).toBe("01:00");
    expect(formatMmSs(5)).toBe("00:05");
  });
});
