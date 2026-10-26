import type { BenchmarkOptionOut } from "../types";

export const BENCHMARK_STORAGE_KEY = "home.benchmark";

export function readStoredBenchmark(): string | null {
  try {
    return localStorage.getItem(BENCHMARK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredBenchmark(index: string): void {
  try {
    localStorage.setItem(BENCHMARK_STORAGE_KEY, index);
  } catch {
    // Storage access may be blocked or quota exceeded
  }
}

export function pickBenchmark(
  options: BenchmarkOptionOut[],
  stored: string | null,
  recommendedIndex: string
): string | null {
  if (options.length === 0) return null;
  if (stored && options.some((opt) => opt.index === stored)) {
    return stored;
  }
  if (options.some((opt) => opt.index === recommendedIndex)) {
    return recommendedIndex;
  }
  return options[0].index;
}
