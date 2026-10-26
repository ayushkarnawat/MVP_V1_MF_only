import { compareDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import { paths } from "@/shell/nav/paths";
import type {
  InstrumentBucket,
  PortfolioSummaryResponse,
  ValuePoint,
} from "./types";

export interface SliceRow {
  key: string;
  label: string;
  percentage: string;
  value: string;
  color: string;
}

export function bucketKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function bucketColor(label: string): string {
  switch (label) {
    case "Mutual Funds":
      return "var(--c1)";
    case "Direct Stocks":
      return "var(--c3)";
    case "US Stocks":
      return "var(--c4)";
    case "FDs & Bonds":
      return "var(--c5)";
    case "Debt":
      return "var(--c2)";
    case "Gold":
      return "var(--c6)";
    case "Real Estate":
      return "var(--c7)";
    default:
      return "var(--ui-text-muted)";
  }
}

export function bucketPath(label: string): string | null {
  switch (label) {
    case "Mutual Funds":
      return paths.mutualFunds.root();
    case "Direct Stocks":
      return paths.equity.directStocks();
    case "US Stocks":
      return paths.equity.usStocks();
    case "FDs & Bonds":
      return paths.equity.fdsBonds();
    case "Debt":
      return paths.debt();
    case "Gold":
      return paths.gold();
    case "Real Estate":
      return paths.realEstate();
    case "Others":
      return paths.others();
    default:
      return null;
  }
}

export function liveTotal(buckets: InstrumentBucket[]): string {
  const live = buckets.filter((b) => b.status === "live");
  if (live.length === 0) return "0";
  return sumDecimalStrings(live.map((b) => b.current_value ?? "0"));
}

export function visibleBuckets(
  buckets: InstrumentBucket[],
  filter: "all" | "live"
): InstrumentBucket[] {
  if (filter === "live") {
    return buckets.filter((b) => b.status === "live");
  }
  return buckets;
}

export function sortBuckets(
  buckets: InstrumentBucket[],
  order: "asc" | "desc"
): InstrumentBucket[] {
  return [...buckets].sort((a, b) => {
    const aVal = a.percentage ?? "0";
    const bVal = b.percentage ?? "0";
    const cmp = compareDecimalStrings(aVal, bVal);
    return order === "asc" ? cmp : cmp === 0 ? 0 : cmp > 0 ? -1 : 1;
  });
}

export function sliceRows(buckets: InstrumentBucket[]): SliceRow[] {
  return buckets
    .filter(
      (b) =>
        b.status === "live" &&
        b.percentage != null &&
        compareDecimalStrings(b.percentage, "0") > 0
    )
    .map((b) => ({
      key: bucketKey(b.label),
      label: b.label,
      percentage: b.percentage!,
      value: b.current_value ?? "0",
      color: bucketColor(b.label),
    }));
}

export function isEmptyPortfolio(summary: PortfolioSummaryResponse): boolean {
  return (
    compareDecimalStrings(summary.total_value, "0") <= 0 &&
    compareDecimalStrings(summary.total_invested, "0") <= 0
  );
}

export function sparkPoints(points: ValuePoint[]): string {
  if (points.length < 2) return "";
  const nums = points.map((p) => Number(p.value));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const n = points.length;
  const round1 = (v: number) => Math.round(v * 10) / 10;

  return nums
    .map((num, i) => {
      const x = round1((i * 72) / (n - 1));
      const y = min === max ? 13 : round1(24 - ((num - min) / (max - min)) * 22);
      return `${x},${y}`;
    })
    .join(" ");
}

export function sparkTrend(points: ValuePoint[]): "up" | "down" | "flat" {
  if (points.length < 2) return "flat";
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const cmp = compareDecimalStrings(last, first);
  if (cmp > 0) return "up";
  if (cmp < 0) return "down";
  return "flat";
}
