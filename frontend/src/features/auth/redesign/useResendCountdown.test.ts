import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMmSs, useResendCountdown } from "./useResendCountdown";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useResendCountdown", () => {
  it("starts at 60 and is active", () => {
    const { result } = renderHook(() => useResendCountdown());
    expect(result.current).toMatchObject({ seconds: 60, active: true });
  });
  it("counts down each second and stops active at 0", () => {
    const { result } = renderHook(() => useResendCountdown());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.seconds).toBe(59);
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(result.current).toMatchObject({ seconds: 0, active: false });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.seconds).toBe(0);
  });
  it("restart goes back to 60", () => {
    const { result } = renderHook(() => useResendCountdown());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.active).toBe(false);
    act(() => { result.current.restart(); });
    expect(result.current).toMatchObject({ seconds: 60, active: true });
  });
  it("takes its own start", () => {
    const { result } = renderHook(() => useResendCountdown(10));
    expect(result.current.seconds).toBe(10);
  });
  it("formats mm:ss", () => {
    expect(formatMmSs(60)).toBe("01:00");
    expect(formatMmSs(59)).toBe("00:59");
    expect(formatMmSs(5)).toBe("00:05");
    expect(formatMmSs(0)).toBe("00:00");
  });
});
