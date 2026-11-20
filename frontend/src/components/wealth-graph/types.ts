export type WealthScopeKind = "aggregate" | "member";

export interface WealthScope {
  viewMode: WealthScopeKind;
  memberId: string | null;
}

export type WealthPeriod = "1D" | "1W" | "1M" | "1Y" | "custom";

export interface WealthDateRange {
  from: string | null;
  to: string | null;
}

export interface WealthBenchmarkOption {
  index: string;
  label: string;
  recommended: boolean;
}

export interface WealthSeriesPoint {
  date: string;
  value: string;
}

export interface WealthBenchmarkPoint {
  date: string;
  pct: string;
}

export interface WealthBenchmarkSeries {
  index: string;
  label: string;
  available: boolean;
  pct: string | null;
  effective_start: string | null;
  clipped: boolean;
  points: readonly WealthBenchmarkPoint[];
}

export interface BenchmarkSeriesEntry {
  benchmark: string;
  points: WealthBenchmarkPoint[];
  clipped: boolean;
  effective_start: string | null;
  available: boolean;
}

export interface WealthSeriesData {
  empty: boolean;
  points: readonly WealthSeriesPoint[];
  benchmark: WealthBenchmarkSeries | null;
  benchmark_series?: BenchmarkSeriesEntry[];
  // Present on Home's reply: the data-completeness flag and the funds still waiting for a price.
  partial?: boolean;
  missing_funds?: { name: string; scheme_id?: string }[];
}

export interface WealthSeriesQuery {
  period: WealthPeriod;
  from?: string;
  to?: string;
  benchmark?: string;
  benchmarks?: string[];
}

export type WealthSeriesStatus = "loading" | "data" | "error";

export type WealthSeriesLoader<T extends WealthSeriesData = WealthSeriesData> = (
  scope: WealthScope,
  query: WealthSeriesQuery,
  signal?: AbortSignal,
) => Promise<T>;
