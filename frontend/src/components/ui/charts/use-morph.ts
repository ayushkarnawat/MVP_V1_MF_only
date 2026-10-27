// frontend/src/components/ui/charts/use-morph.ts
import { useEffect, useRef, useState } from "react";

export function resample(values: number[], count: number): number[] {
  if (count <= 0) return [];
  if (values.length === 0) return new Array(count).fill(0);
  if (count === 1) return [values[0]];
  if (values.length === 1) return new Array(count).fill(values[0]);
  if (values.length === count) return [...values];

  const n = values.length;
  const result: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const pos = (i * (n - 1)) / (count - 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.min(n - 1, Math.ceil(pos));
    const frac = pos - lowerIndex;
    result[i] = values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * frac;
  }
  return result;
}

export function niceTicks(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi <= lo) hi = lo + 1;

  const raw = (hi - lo) / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1 * power, 2 * power, 5 * power, 10 * power];
  const step = candidates.find(c => c >= raw - 1e-12) ?? 10 * power;
  const first = Math.floor(lo / step + 1e-9);

  const ticks: number[] = [];
  for (let k = first; ; k++) {
    const tick = Number((k * step).toFixed(10));
    ticks.push(tick);
    if (tick >= hi - 1e-9 * step) break;
  }
  return ticks;
}

export function useMorph(target: number[][], options?: { durationMs?: number }): number[][] {
  const durationMs = options?.durationMs ?? 400;
  const [shown, setShown] = useState<number[][]>(target);

  const latestShownRef = useRef<number[][]>(target);
  const targetRef = useRef<number[][]>(target);
  targetRef.current = target;
  const frameIdRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);

  const targetKey = JSON.stringify(target);

  useEffect(() => {
    const currentTarget = targetRef.current;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      latestShownRef.current = currentTarget;
      return;
    }

    if (frameIdRef.current != null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || durationMs <= 0) {
      latestShownRef.current = currentTarget;
      setShown(currentTarget);
      return;
    }

    const from = currentTarget.map((targetSeries, sIdx) => {
      const oldSeries = latestShownRef.current[sIdx];
      if (!oldSeries) return [...targetSeries];
      return resample(oldSeries, targetSeries.length);
    });

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const ease = 1 - (1 - t) ** 3;

      if (t >= 1) {
        latestShownRef.current = currentTarget;
        setShown(currentTarget);
        frameIdRef.current = null;
      } else {
        const frame = currentTarget.map((targetSeries, sIdx) => {
          const fromSeries = from[sIdx];
          return targetSeries.map((targetVal, j) => {
            const fromVal = fromSeries[j];
            return fromVal + (targetVal - fromVal) * ease;
          });
        });
        latestShownRef.current = frame;
        setShown(frame);
        frameIdRef.current = requestAnimationFrame(tick);
      }
    };

    frameIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameIdRef.current != null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [targetKey, durationMs]);

  return shown;
}
