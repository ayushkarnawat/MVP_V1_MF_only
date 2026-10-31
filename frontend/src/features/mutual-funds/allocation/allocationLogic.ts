import { compareDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { percentOf, slugify } from "../mfCopy";
import type {
  AnalyticsAllocationBucket,
  AssetAllocationClassFund,
  AssetAllocationVariant,
  AssetClassKey,
  CapAllocationSummary,
  CapKey,
  HoldingRow,
  ManagerGroup,
  Slice,
} from "../types";

export interface AnalyticsCardProps<T> {
  state: "loading" | "ready" | "failed" | "error";
  data: T | null;
  onRetry: () => void;
}

export const ASSET_LABELS: Record<AssetClassKey, string> = {
  equity: "Equity",
  debt: "Debt",
  gold: "Gold",
  cash_like: "Cash-like",
  real_estate: "Real Estate (REITs and InvITs)",
  others: "Others",
};

export const CAP_LABELS: Record<CapKey, string> = {
  LARGE: "Large Cap",
  MID: "Mid Cap",
  SMALL: "Small Cap",
  OTHER: "Other / Unclassified",
};

export type SortOrder = "asc" | "desc";

export function colorAt(index: number): string {
  return `var(--c${(index % 8) + 1})`;
}

export function chartPct(pct: string): string {
  const trimmed = pct.trim();
  if (trimmed.startsWith("-")) return "0";
  return trimmed;
}

export function assetSlices(variant: AssetAllocationVariant): Slice[] {
  return variant.classes.map((item, index) => ({
    key: item.key,
    label: ASSET_LABELS[item.key],
    value: item.value,
    pct: item.percentage,
    color: colorAt(index),
  }));
}

export interface OuterArc {
  key: string;
  classKey: string;
  label: string;
  value?: string;
  pct: string;
  color: string;
}

export function outerArcs(variant: AssetAllocationVariant): OuterArc[] {
  const arcs: OuterArc[] = [];
  variant.classes.forEach((item, classIndex) => {
    if (item.key === "equity") {
      variant.equity_outer.forEach((cap, capIndex) => {
        arcs.push({
          key: cap.key.toLowerCase(),
          classKey: "equity",
          label: CAP_LABELS[cap.key],
          value: cap.value,
          pct: cap.percentage,
          color: colorAt(capIndex + 3),
        });
      });
    } else {
      arcs.push({
        key: item.key,
        classKey: item.key,
        label: ASSET_LABELS[item.key],
        value: item.value,
        pct: item.percentage,
        color: colorAt(classIndex),
      });
    }
  });
  return arcs;
}

export function capSlices(summary: CapAllocationSummary, equityOnly: boolean): Slice[] {
  return summary.buckets.map((bucket, index) => ({
    key: bucket.key.toLowerCase(),
    label: CAP_LABELS[bucket.key],
    value: bucket.value,
    pct: equityOnly ? bucket.percentage_equity : bucket.percentage_total,
    color: colorAt(index),
  }));
}

export function largestSlice(slices: Slice[]): Slice | null {
  if (slices.length === 0) return null;
  let largest: Slice | null = null;
  for (const s of slices) {
    if (!largest || compareDecimalStrings(s.pct, largest.pct) > 0) {
      largest = s;
    }
  }
  return largest;
}

export function hasNegative(slices: Slice[]): boolean {
  return slices.some(s => s.pct.trim().startsWith("-"));
}

export function bucketSlices(
  items: AnalyticsAllocationBucket[],
  order: SortOrder
): Slice[] {
  const slices: Slice[] = items.map((item, index) => ({
    key: slugify(item.label),
    label: item.label,
    value: item.current_value,
    pct: item.percentage,
    color: colorAt(index),
  }));

  slices.sort((a, b) => {
    const cmp = compareDecimalStrings(a.pct, b.pct);
    if (cmp !== 0) {
      return order === "desc" ? -cmp : cmp;
    }
    return a.label.localeCompare(b.label);
  });

  return slices;
}

export function managerKey(group: { manager_name: string; amc_name: string }): string {
  return slugify(`${group.manager_name} ${group.amc_name}`);
}

export function managerSlices(groups: ManagerGroup[]): Slice[] {
  return groups.map((g, index) => ({
    key: managerKey(g),
    label: g.manager_name,
    value: g.total_household_value,
    pct: g.percentage,
    color: colorAt(index),
  }));
}

export interface SliceFund {
  schemeId: string;
  name: string;
  value: string;
  share: string | null;
  largest: boolean;
}

export function fundsInSlice(
  kind: "category" | "amc",
  label: string,
  holdings: HoldingRow[],
  sliceValue: string
): { funds: SliceFund[]; count: number } {
  const matching = holdings.filter(row => {
    if (row.nav_unavailable || row.current_value == null) return false;
    const matchLabel = kind === "category" ? (row.sebi_category ?? row.category) : row.amc_name;
    return matchLabel === label;
  });

  const schemeMap = new Map<string, { schemeId: string; name: string; value: string }>();
  for (const row of matching) {
    const existing = schemeMap.get(row.scheme_id);
    if (existing) {
      existing.value = sumDecimalStrings([existing.value, row.current_value!]);
    } else {
      schemeMap.set(row.scheme_id, {
        schemeId: row.scheme_id,
        name: row.scheme_name,
        value: row.current_value!,
      });
    }
  }

  const sorted = Array.from(schemeMap.values()).sort((a, b) => {
    const cmp = compareDecimalStrings(b.value, a.value);
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  });

  const funds: SliceFund[] = sorted.map((fund, index) => ({
    schemeId: fund.schemeId,
    name: fund.name,
    value: fund.value,
    share: percentOf(fund.value, sliceValue),
    largest: index === 0,
  }));

  return { funds, count: funds.length };
}

/** The funds behind one asset class (backend C160), in the order the backend sent them (largest first); null when the
 * payload has none for the class (an old payload), which is different from an empty list. */
export function classFunds(variant: AssetAllocationVariant, key: AssetClassKey): AssetAllocationClassFund[] | null {
  return variant.classes.find(item => item.key === key)?.funds ?? null;
}

