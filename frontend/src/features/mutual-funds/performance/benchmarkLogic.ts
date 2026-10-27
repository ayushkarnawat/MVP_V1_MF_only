import { diffDecimalStrings, toPercentString } from "../../../lib/decimal";
import { formatPercent } from "../../../lib/format";
import type {
  BenchmarkIndexKey,
  BenchmarkWindow,
  FundBenchmarkRow,
  PortfolioBenchmarkSummary,
} from "../types";

export const INDEX_DEFS: ReadonlyArray<{ key: BenchmarkIndexKey; label: string }> = [
  { key: "nifty_50", label: "Nifty 50" },
  { key: "nifty_500", label: "Nifty 500" },
  { key: "nifty_largemidcap_250", label: "LargeMidcap 250" },
  { key: "nifty_midcap_150", label: "Midcap 150" },
  { key: "nifty_next_50", label: "Nifty Next 50" },
  { key: "nifty_smallcap_250", label: "Smallcap 250" },
  { key: "nifty_100", label: "Nifty 100" },
  { key: "nifty_200", label: "Nifty 200" },
];

export const DEFAULT_INDICES: BenchmarkIndexKey[] = ["nifty_500"];

export const WINDOW_DEFS: ReadonlyArray<{ id: BenchmarkWindow; label: string }> = [
  { id: "1Y", label: "1Y" },
  { id: "3Y", label: "3Y" },
  { id: "5Y", label: "5Y" },
  { id: "SI", label: "Since Inception" },
];

export const PORTFOLIO_KEY = "portfolio";

export type EntityKey = "portfolio" | BenchmarkIndexKey;

export interface BenchmarkEntity {
  key: EntityKey;
  label: string;
  xirr: string | null;
}

export function indexLabel(key: BenchmarkIndexKey | string): string {
  const match = INDEX_DEFS.find(def => def.key === key);
  return match ? match.label : key;
}

export function entityLabel(key: EntityKey): string {
  return key === "portfolio" ? "Your Portfolio" : indexLabel(key);
}

export function signedXirr(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatPercent(toPercentString(value), { digits: 1, signed: true });
}

export type WindowReason = "ok" | "recomputing" | "not_enough_history" | "opening_balance_in_window";

export interface WindowView {
  available: boolean;
  reason: WindowReason;
  startDate: string | null;
  portfolio: string | null;
  indices: Partial<Record<BenchmarkIndexKey, string | null>>;
}

export function windowView(
  summary: PortfolioBenchmarkSummary | null,
  window: BenchmarkWindow
): WindowView {
  if (!summary) {
    return {
      available: false,
      reason: "not_enough_history",
      startDate: null,
      portfolio: null,
      indices: {},
    };
  }

  const windows = summary.windows;
  if (windows !== undefined && windows.length > 0) {
    const row = windows.find(item => item.window === window);
    if (!row || !row.available) {
      const reason: WindowReason =
        row?.unavailable_reason === "opening_balance_in_window"
          ? "opening_balance_in_window"
          : "not_enough_history";
      return {
        available: false,
        reason,
        startDate: null,
        portfolio: null,
        indices: {},
      };
    }

    const indicesMap: Partial<Record<BenchmarkIndexKey, string | null>> = {};
    for (const item of row.indices ?? []) {
      indicesMap[item.index] = item.xirr;
    }

    return {
      available: true,
      reason: "ok",
      startDate: row.start_date,
      portfolio: row.portfolio_xirr,
      indices: indicesMap,
    };
  }

  // Fallback for summary without windows
  if (window === "SI") {
    const indicesMap: Partial<Record<BenchmarkIndexKey, string | null>> = {};
    for (const item of summary.benchmarks ?? []) {
      indicesMap[item.index] = item.xirr;
    }
    return {
      available: true,
      reason: "ok",
      startDate: null,
      portfolio: summary.portfolio_xirr ?? null,
      indices: indicesMap,
    };
  }

  return {
    available: false,
    reason: "recomputing",
    startDate: null,
    portfolio: null,
    indices: {},
  };
}

export function windowUnavailableText(reason: WindowReason): string {
  if (reason === "recomputing") {
    return "This window is still being recalculated and will appear after the next analytics refresh.";
  }
  if (reason === "opening_balance_in_window") {
    return "Unavailable: an opening balance from your statement falls inside this window, so money added and starting value cannot be told apart.";
  }
  return "Not enough history for this window yet.";
}

export function buildEntities(
  summary: PortfolioBenchmarkSummary | null,
  window: BenchmarkWindow,
  selected: BenchmarkIndexKey[]
): BenchmarkEntity[] {
  const view = windowView(summary, window);
  const entities: BenchmarkEntity[] = [
    {
      key: "portfolio",
      label: "Your Portfolio",
      xirr: view.portfolio,
    },
  ];

  const selectedSet = new Set(selected);
  for (const def of INDEX_DEFS) {
    if (selectedSet.has(def.key)) {
      entities.push({
        key: def.key,
        label: def.label,
        xirr: view.indices[def.key] ?? null,
      });
    }
  }

  return entities;
}

export interface TrackMarker {
  key: EntityKey;
  x: number;
  offset: number;
  above: boolean;
  crown: boolean;
}

export const MIN_GAP = 8;

export function layoutRaceTrack(
  entities: { key: EntityKey; xirr: string | null }[]
): TrackMarker[] {
  const valid = entities.filter(e => e.xirr !== null);
  if (valid.length === 0) return [];

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const numValues = valid.map(e => Number(e.xirr));
  const min = Math.min(...numValues);
  const max = Math.max(...numValues);

  // Crown: entity with highest value, first in input order on tie
  let crownKey: EntityKey | null = null;
  for (const e of entities) {
    if (e.xirr !== null && Number(e.xirr) === max) {
      crownKey = e.key;
      break;
    }
  }

  interface MarkerWithVal {
    key: EntityKey;
    val: number;
    inputIdx: number;
    x: number;
    crown: boolean;
  }

  const markersWithVal: MarkerWithVal[] = valid.map((e, idx) => {
    const val = Number(e.xirr);
    const x = max === min ? 50 : round2(5 + ((val - min) / (max - min)) * 90);
    return {
      key: e.key,
      val,
      inputIdx: idx,
      x,
      crown: e.key === crownKey,
    };
  });

  // Sort ascending by value (ties by input order)
  markersWithVal.sort((a, b) => {
    if (a.val !== b.val) return a.val - b.val;
    return a.inputIdx - b.inputIdx;
  });

  const result: TrackMarker[] = [];
  for (let i = 0; i < markersWithVal.length; i++) {
    const item = markersWithVal[i];
    const above = i % 2 === 0;
    let offset = 0;
    if (i > 0) {
      const prevX = markersWithVal[i - 1].x;
      const gap = item.x - prevX;
      if (gap < MIN_GAP) {
        const sign = i % 2 === 0 ? -1 : 1;
        offset = sign * Math.round(6 + ((MIN_GAP - gap) / MIN_GAP) * 10);
      }
    }

    result.push({
      key: item.key,
      x: item.x,
      offset,
      above,
      crown: item.crown,
    });
  }

  return result;
}

export function barPercent(
  value: string | null,
  entities: { xirr: string | null }[]
): string {
  if (value === null) return "0";
  const numVal = Math.abs(Number(value));
  let largest = 0;
  for (const e of entities) {
    if (e.xirr !== null) {
      const absVal = Math.abs(Number(e.xirr));
      if (absVal > largest) largest = absVal;
    }
  }

  if (largest === 0) return "0";
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return String(round2((numVal / largest) * 100));
}

export interface FundWindowView {
  fund: string | null;
  benchmark: string | null;
}

export function fundWindow(
  fund: FundBenchmarkRow,
  window: BenchmarkWindow
): FundWindowView {
  if (fund.windows !== undefined && fund.windows.length > 0) {
    const row = fund.windows.find(w => w.window === window);
    if (!row) {
      return { fund: null, benchmark: null };
    }
    return { fund: row.fund_xirr, benchmark: row.benchmark_xirr };
  }

  if (window === "SI") {
    return {
      fund: fund.fund_xirr ?? null,
      benchmark: fund.benchmark_xirr ?? null,
    };
  }

  return { fund: null, benchmark: null };
}

export function fundDifference(view: FundWindowView): string | null {
  if (view.fund === null || view.benchmark === null) return null;
  return diffDecimalStrings(toPercentString(view.fund), toPercentString(view.benchmark));
}

export function fundsForWindow(
  funds: FundBenchmarkRow[],
  window: BenchmarkWindow
): Array<{ fund: FundBenchmarkRow; view: FundWindowView }> {
  const result: Array<{ fund: FundBenchmarkRow; view: FundWindowView }> = [];
  for (const f of funds) {
    const view = fundWindow(f, window);
    if (view.fund !== null) {
      result.push({ fund: f, view });
    }
  }
  return result;
}

export function miniTrack(
  view: FundWindowView
): { fund: number; benchmark: number } | null {
  if (view.fund === null || view.benchmark === null) return null;
  const fNum = Number(view.fund);
  const bNum = Number(view.benchmark);
  const lo = Math.min(fNum, bNum);
  const hi = Math.max(fNum, bNum);
  const span = hi - lo;
  if (span === 0) {
    return { fund: 50, benchmark: 50 };
  }
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    fund: round2(5 + ((fNum - lo) / span) * 90),
    benchmark: round2(5 + ((bNum - lo) / span) * 90),
  };
}
