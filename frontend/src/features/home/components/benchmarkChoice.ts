import type { BenchmarkOptionOut } from "../types";

export const BENCHMARK_STORAGE_KEY = "home.benchmark";
export const MAX_BENCHMARKS = 3;

const LEGACY_INDEX_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

export function readStoredBenchmarks(): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(BENCHMARK_STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === "string")) {
      return parsed.filter((item) => item.trim().length > 0);
    }
    return [];
  } catch {
    if (LEGACY_INDEX_PATTERN.test(trimmed)) {
      return [trimmed];
    }
    return [];
  }
}

export function writeStoredBenchmarks(indices: string[]): void {
  try {
    localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(indices));
  } catch {
    // Storage access may be blocked or quota exceeded
  }
}

export function pickBenchmarks(
  options: BenchmarkOptionOut[],
  stored: string[],
  recommendedIndex: string,
): string[] {
  if (options.length === 0) return [];

  const offered = new Set(options.map((opt) => opt.index));
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const idx of stored) {
    if (offered.has(idx) && !seen.has(idx)) {
      seen.add(idx);
      kept.push(idx);
      if (kept.length === MAX_BENCHMARKS) break;
    }
  }

  if (kept.length > 0) return kept;
  if (offered.has(recommendedIndex)) return [recommendedIndex];
  return [options[0].index];
}
