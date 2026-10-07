import { getAggregateSnapshots, getMemberSnapshots } from "../dashboard/api";
import type { SnapshotRow } from "../dashboard/types";
import { sumDecimalStrings } from "../../lib/decimal";

/** One month-end on the history chart (#12). Values are display numbers. */
export interface HistoryPoint {
  month: string;          // ISO month-end date
  value: number;
  invested: number | null;
  partial: boolean;       // a held fund had no NAV that month
  missing: string[];      // the funds that had no NAV
}

function toPoints(rows: SnapshotRow[]): HistoryPoint[] {
  // Money stays as decimal strings until the one display conversion
  // (lib/decimal.ts), as everywhere else on the dashboard.
  const byMonth = new Map<string, { values: string[]; invested: string[] | null; partial: boolean; missing: string[] }>();
  for (const r of rows) {
    const m = byMonth.get(r.snapshot_month) ?? { values: [], invested: [], partial: false, missing: [] };
    m.values.push(r.total_value);
    m.invested = r.invested_value == null || m.invested === null ? null : [...m.invested, r.invested_value];
    m.partial = m.partial || Boolean(r.is_partial);
    m.missing = [...m.missing, ...(r.missing_scheme_names ?? [])];
    byMonth.set(r.snapshot_month, m);
  }
  return [...byMonth.entries()]
    .map(([month, m]) => ({
      month,
      value: parseFloat(sumDecimalStrings(m.values)),
      invested: m.invested === null ? null : parseFloat(sumDecimalStrings(m.invested)),
      partial: m.partial,
      missing: m.missing,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** The family view sums every member month by month; a month is partial
 * when any member's is. The backend computes or refreshes missing months
 * on request, so this can take a moment on a first visit. */
export async function fetchHistory(viewMode: "aggregate" | "member", memberId: string | null): Promise<HistoryPoint[]> {
  if (viewMode === "aggregate") return toPoints((await getAggregateSnapshots()).snapshots);
  if (!memberId) return [];
  return toPoints(await getMemberSnapshots(memberId));
}
