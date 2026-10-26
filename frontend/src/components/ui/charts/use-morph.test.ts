import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { niceTicks, resample, useMorph } from "./use-morph";

describe("resample", () => {
  it("returns a copy when the length already matches", () => {
    const input = [1, 2, 3];
    const out = resample(input, 3);
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });

  it("upsamples linearly and keeps the first and last point", () => {
    expect(resample([0, 10], 3)).toEqual([0, 5, 10]);
    expect(resample([0, 10, 20], 5)).toEqual([0, 5, 10, 15, 20]);
  });

  it("downsamples by picking interpolated points", () => {
    expect(resample([0, 10, 20, 30, 40], 3)).toEqual([0, 20, 40]);
  });

  it("repeats a single point and fills an empty series with zeros", () => {
    expect(resample([7], 4)).toEqual([7, 7, 7, 7]);
    expect(resample([], 3)).toEqual([0, 0, 0]);
  });

  it("returns nothing for a count of zero and the first point for a count of one", () => {
    expect(resample([1, 2, 3], 0)).toEqual([]);
    expect(resample([1, 2, 3], 1)).toEqual([1]);
  });
});

describe("niceTicks", () => {
  it("uses steps of 1, 2 or 5 times a power of ten", () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-50, 150)).toEqual([-50, 0, 50, 100, 150]);
  });

  it("always extends the last tick to at least the maximum (the clipped-axis regression)", () => {
    expect(niceTicks(0, 87).at(-1)).toBe(100);
    expect(niceTicks(0, 101).at(-1)).toBeGreaterThanOrEqual(101);
    expect(niceTicks(12, 87)[0]).toBeLessThanOrEqual(12);
  });

  it("copes with a flat or reversed range", () => {
    const flat = niceTicks(3, 3);
    expect(flat[0]).toBeLessThanOrEqual(3);
    expect(flat.at(-1)).toBeGreaterThanOrEqual(3);
    expect(flat.length).toBeGreaterThan(1);
    expect(niceTicks(5, 2).length).toBeGreaterThan(1);
    expect(niceTicks(Number.NaN, 10)).toEqual([0, 1]);
  });

  it("covers the data and stays evenly spaced for many seeded random ranges", () => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 300; n++) {
      const lo = (random() - 0.5) * 10 ** Math.floor(random() * 8);
      const hi = lo + random() * 10 ** Math.floor(random() * 8) + 1e-6;
      const ticks = niceTicks(lo, hi);
      expect(ticks[0]).toBeLessThanOrEqual(lo + 1e-9 * Math.abs(lo));
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(hi - 1e-9 * Math.abs(hi));
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(9);
      const step = ticks[1] - ticks[0];
      ticks.slice(1).forEach((tick, i) => expect(tick - ticks[i]).toBeCloseTo(step, 6));
    }
  });
});

describe("useMorph", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the target immediately on the first render", () => {
    const { result } = renderHook(() => useMorph([[1, 2, 3]]));
    expect(result.current).toEqual([[1, 2, 3]]);
  });

  it("reaches the target in 400 ms", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 0]] } });
    rerender({ target: [[100, 200]] });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(result.current).toEqual([[100, 200]]);
  });

  it("is between the old and the new values part-way through", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 0]] } });
    rerender({ target: [[100, 100]] });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const [first, second] = result.current[0];
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(100);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(100);
  });

  it("is immediate when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }));
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 0]] } });
    rerender({ target: [[100, 100]] });
    expect(result.current).toEqual([[100, 100]]);
  });

  it("cancels the running animation when a new target arrives and ends on the newest target", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 0]] } });
    rerender({ target: [[100, 100]] });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ target: [[-50, 20]] });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(result.current).toEqual([[-50, 20]]);
  });

  it("resamples the old frame to the new length so the first frame already has the new point count", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 10, 20]] } });
    rerender({ target: [[0, 5, 10, 15, 20]] });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current[0]).toHaveLength(5);
  });

  it("does not restart when re-rendered with equal numbers in a new array", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[0, 0]] } });
    rerender({ target: [[100, 100]] });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ target: [[100, 100]] });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toEqual([[100, 100]]);
  });

  it("returns a series that gains a new line at once at its target", () => {
    const { result, rerender } = renderHook(({ target }) => useMorph(target), { initialProps: { target: [[1, 2]] } });
    rerender({ target: [[1, 2], [5, 6]] });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(result.current).toEqual([[1, 2], [5, 6]]);
  });
});
