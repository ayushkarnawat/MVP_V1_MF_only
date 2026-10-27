import { diffDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { MONTHS_LONG } from "../mfCopy";
import type {
  InvestmentWithdrawalBucket,
  InvestmentWithdrawalEntry,
  InvestmentWithdrawalResult,
} from "../types";

export type Granularity = "monthly" | "yearly";

export type LedgerFilter = "all" | "purchases" | "redemptions" | "switches";

export const LEDGER_FILTERS: ReadonlyArray<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "purchases", label: "Purchases" },
  { id: "redemptions", label: "Redemptions" },
  { id: "switches", label: "Switches" },
];

export const LEDGER_PAGE = 50;

export type LedgerKind = "purchase" | "reversal" | "redemption" | "switch";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function periodTitle(period: string): string {
  if (period.length === 7) {
    const year = period.slice(0, 4);
    const monthIdx = Number(period.slice(5, 7)) - 1;
    return `${MONTHS_LONG[monthIdx]} ${year}`;
  }
  return period;
}

export function shortPeriod(period: string): string {
  if (period.length === 7) {
    const year = period.slice(2, 4);
    const monthIdx = Number(period.slice(5, 7)) - 1;
    return `${SHORT_MONTHS[monthIdx]} ’${year}`;
  }
  return period;
}

export function kindOf(entry: InvestmentWithdrawalEntry): LedgerKind | null {
  switch (entry.direction) {
    case "invested":
      return "purchase";
    case "reversal":
      return "reversal";
    case "withdrawn":
      return "redemption";
    case "switched_in":
    case "switched_out":
      return "switch";
    default:
      return null;
  }
}

export function filterFor(kind: LedgerKind): LedgerFilter {
  switch (kind) {
    case "purchase":
    case "reversal":
      return "purchases";
    case "redemption":
      return "redemptions";
    case "switch":
      return "switches";
  }
}

export interface LedgerRow {
  entry: InvestmentWithdrawalEntry;
  kind: LedgerKind;
}

export function ledgerRows(
  buckets: InvestmentWithdrawalBucket[],
  filter: LedgerFilter
): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const bucket of buckets) {
    for (const item of bucket.entries) {
      const k = kindOf(item);
      if (k !== null) {
        if (filter === "all" || filterFor(k) === filter) {
          rows.push({ entry: item, kind: k });
        }
      }
    }
  }

  return rows.sort((a, b) => {
    const dateCmp = b.entry.date.localeCompare(a.entry.date);
    if (dateCmp !== 0) return dateCmp;
    return b.entry.transaction_id.localeCompare(a.entry.transaction_id);
  });
}

export function cashFlowTiles(data: InvestmentWithdrawalResult): {
  invested: string;
  withdrawn: string;
  netSwitched: string;
  netInvested: string;
} {
  return {
    invested: data.total_invested,
    withdrawn: data.total_withdrawn,
    netSwitched: diffDecimalStrings(
      data.total_switched_in ?? "0",
      data.total_switched_out ?? "0"
    ),
    netInvested: data.net_invested,
  };
}

export function outflow(bucket: InvestmentWithdrawalBucket): string {
  return sumDecimalStrings([bucket.withdrawn, bucket.switched_out ?? "0"]);
}

export function barHeights(
  buckets: InvestmentWithdrawalBucket[]
): Array<{ period: string; invested: number; outflow: number }> {
  if (buckets.length === 0) return [];

  let tallest = 0;
  for (const b of buckets) {
    const inv = Math.max(0, Number(b.invested));
    const out = Math.max(0, Number(outflow(b)));
    if (inv > tallest) tallest = inv;
    if (out > tallest) tallest = out;
  }

  return buckets.map(b => {
    if (tallest === 0) {
      return { period: b.period, invested: 0, outflow: 0 };
    }
    const inv = Math.max(0, Number(b.invested));
    const out = Math.max(0, Number(outflow(b)));
    return {
      period: b.period,
      invested: Math.round((inv / tallest) * 10000) / 100,
      outflow: Math.round((out / tallest) * 10000) / 100,
    };
  });
}
