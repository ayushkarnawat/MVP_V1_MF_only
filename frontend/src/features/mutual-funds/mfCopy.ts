import { compareDecimalStrings, diffDecimalStrings, sumDecimalStrings, toPercentString } from "../../lib/decimal";
import { formatPercent, formatRupees } from "../../lib/format";
import type { AllocationSummary, HistoryPoint, HoldingRow, LookthroughCoverage, SipRow } from "./types";

export function changeDirection(value: string | null | undefined): "up" | "down" | "flat" {
  if (value == null) return "flat";
  const trimmed = value.trim();
  if (!trimmed) return "flat";
  const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return "flat";
  const whole = match[2];
  const frac = match[3] ?? "";
  const isAllZero = /^0+$/.test(whole) && /^0*$/.test(frac);
  if (isAllZero) return "flat";
  return match[1] === "-" ? "down" : "up";
}

export function formatSignedRupees(value: string | null | undefined): string {
  const formatted = formatRupees(value);
  if (formatted === "—" || formatted === "₹0" || formatted.startsWith("-")) {
    return formatted;
  }
  return `+${formatted}`;
}

export function formatSignedPercent(value: string | null | undefined, digits = 1): string {
  return formatPercent(value, { digits, signed: true });
}

export function formatXirr(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatPercent(toPercentString(value), { digits: 1 });
}

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTHS_SHORT = [
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

export function dayMonth(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  const monthIdx = Number(parts[1]) - 1;
  const dayStr = parts[2];
  return `${dayStr} ${MONTHS_SHORT[monthIdx]}`;
}

export function monthLabel(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  return `${MONTHS_SHORT[monthIdx]} ${year}`;
}

export function monthName(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  return `${MONTHS_LONG[monthIdx]} ${year}`;
}

function formatIndianGrouping(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function formatUnits(value: string | null | undefined): string {
  if (value == null) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return "—";
  const sign = match[1] === "-" ? "-" : "";
  const whole = formatIndianGrouping(match[2]);
  const frac = match[3] !== undefined ? `.${match[3]}` : "";
  return `${sign}${whole}${frac}`;
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function memberInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

export function percentOf(part: string | null | undefined, whole: string | null | undefined): string | null {
  if (part == null || whole == null) return null;
  const pTrim = part.trim();
  const wTrim = whole.trim();
  const pMatch = pTrim.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  const wMatch = wTrim.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!pMatch || !wMatch) return null;

  const pNegative = pMatch[1] === "-";
  const wNegative = wMatch[1] === "-";
  if (wNegative) return null;

  const pFrac = pMatch[3] ?? "";
  const wFrac = wMatch[3] ?? "";
  const scale = Math.max(pFrac.length, wFrac.length);

  const pScaled = BigInt(pMatch[2] + pFrac.padEnd(scale, "0"));
  const wScaled = BigInt(wMatch[2] + wFrac.padEnd(scale, "0"));

  if (wScaled <= 0n) return null;

  const scaled = (pScaled * 1000000n + wScaled / 2n) / wScaled;
  if (scaled === 0n) return "0.0000";

  const intPart = (scaled / 10000n).toString();
  const fracPart = (scaled % 10000n).toString().padStart(4, "0");
  const sign = pNegative ? "-" : "";
  return `${sign}${intPart}.${fracPart}`;
}

export function todayChangePct(row: HoldingRow): string | null {
  if (row.nav_unavailable || row.stale_nav || row.current_value == null || row.today_gain == null) {
    return null;
  }
  const yesterdayValue = diffDecimalStrings(row.current_value, row.today_gain);
  return percentOf(row.today_gain, yesterdayValue);
}

export interface HoldingTotals {
  value: string;
  invested: string;
  unrealised: string;
  unrealisedPct: string | null;
  todayGain: string;
  todayPct: string | null;
  staleCount: number;
  unpricedCount: number;
}

export function holdingTotals(rows: HoldingRow[]): HoldingTotals {
  const priced = rows.filter(r => !r.nav_unavailable);
  const fresh = priced.filter(r => !r.stale_nav);

  const value = priced.length > 0 ? sumDecimalStrings(priced.map(r => r.current_value || "0")) : "0";
  const invested = priced.length > 0 ? sumDecimalStrings(priced.map(r => r.amount_invested || "0")) : "0";
  const unrealised = priced.length > 0 ? sumDecimalStrings(priced.map(r => r.unrealized_gain || "0")) : "0";
  const todayGain = fresh.length > 0 ? sumDecimalStrings(fresh.map(r => r.today_gain || "0")) : "0";

  const unrealisedPct = priced.length > 0 ? percentOf(unrealised, invested) : null;
  const freshValue = fresh.length > 0 ? sumDecimalStrings(fresh.map(r => r.current_value || "0")) : "0";
  const todayPct = fresh.length > 0 ? percentOf(todayGain, diffDecimalStrings(freshValue, todayGain)) : null;

  const staleCount = priced.filter(r => Boolean(r.stale_nav)).length;
  const unpricedCount = rows.filter(r => Boolean(r.nav_unavailable)).length;

  return {
    value,
    invested,
    unrealised,
    unrealisedPct,
    todayGain,
    todayPct,
    staleCount,
    unpricedCount,
  };
}

export function splitByPlan(rows: HoldingRow[]): { direct: number; regular: number } | null {
  const priced = rows.filter(r => !r.nav_unavailable && r.current_value != null);
  const directRows = priced.filter(r => r.plan_type === "direct");
  const regularRows = priced.filter(r => r.plan_type === "regular");

  if (directRows.length === 0 && regularRows.length === 0) {
    return null;
  }

  const directVal = sumDecimalStrings(directRows.map(r => r.current_value || "0"));
  const regularVal = sumDecimalStrings(regularRows.map(r => r.current_value || "0"));
  const totalVal = sumDecimalStrings([directVal, regularVal]);

  const pct = percentOf(directVal, totalVal);
  if (pct == null) return null;

  const [wholeStr, fracStr = ""] = pct.split(".");
  let direct = Number(wholeStr);
  if (fracStr.length > 0 && fracStr[0] >= "5") {
    direct += 1;
  }
  const regular = 100 - direct;
  return { direct, regular };
}

export function monthlySipTotal(sips: SipRow[]): string {
  const active = sips.filter(s => (s.status ?? "active") !== "stopped");
  if (active.length === 0) return "0";
  const amounts: string[] = [];
  for (const sip of active) {
    const count = sip.series_count ?? 1;
    for (let i = 0; i < count; i++) {
      amounts.push(sip.sip_amount);
    }
  }
  return sumDecimalStrings(amounts);
}

export function buildSynopsis(
  allocation: AllocationSummary,
  holdings: HoldingRow[],
  sipMonthly: string | null
): string {
  const n = allocation.by_amc.length;
  const distinctSchemes = new Set(holdings.map(h => h.scheme_id));
  const m = distinctSchemes.size;

  const amcText = n === 1 ? "1 AMC" : `${n} AMCs`;
  const fundText = m === 1 ? "1 fund" : `${m} funds`;
  const head = `Spread across ${amcText} and ${fundText}`;

  const split = splitByPlan(holdings);
  const hasSip = sipMonthly != null && sipMonthly !== "0" && changeDirection(sipMonthly) === "up";

  if (split && hasSip) {
    return `${head} — ${split.direct}% in Direct plans, with ${formatRupees(sipMonthly)} in active SIPs this month.`;
  }
  if (split && !hasSip) {
    return `${head} — ${split.direct}% in Direct plans.`;
  }
  if (!split && hasSip) {
    return `${head} — ${formatRupees(sipMonthly)} in active SIPs this month.`;
  }
  return `${head}.`;
}

export function buildOverviewInsights(
  allocation: AllocationSummary,
  holdings: HoldingRow[],
  sipMonthly: string | null
): string[] {
  const lines: string[] = [];

  const priced = holdings.filter(h => !h.nav_unavailable && h.current_value != null);
  if (priced.length > 0) {
    const schemeTotals = new Map<string, { name: string; value: string }>();
    for (const h of priced) {
      const existing = schemeTotals.get(h.scheme_id);
      if (existing) {
        existing.value = sumDecimalStrings([existing.value, h.current_value!]);
      } else {
        schemeTotals.set(h.scheme_id, { name: h.scheme_name, value: h.current_value! });
      }
    }

    let largest: { name: string; value: string } | null = null;
    for (const entry of schemeTotals.values()) {
      if (!largest || compareDecimalStrings(entry.value, largest.value) > 0) {
        largest = entry;
      }
    }

    if (largest) {
      const totalPriced = sumDecimalStrings(priced.map(h => h.current_value!));
      const pct = percentOf(largest.value, totalPriced);
      if (pct != null) {
        lines.push(`Your largest holding is ${largest.name} — ${formatPercent(pct, { digits: 1 })} of your MF portfolio`);
      }
    }
  }

  const n = allocation.by_amc.length;
  const m = new Set(holdings.map(h => h.scheme_id)).size;
  const amcText = n === 1 ? "1 AMC" : `${n} AMCs`;
  const fundText = m === 1 ? "1 fund" : `${m} funds`;
  lines.push(`Spread across ${amcText} and ${fundText}`);

  const split = splitByPlan(holdings);
  if (split) {
    lines.push(`${split.direct}% Direct, ${split.regular}% Regular`);
  }

  const hasSip = sipMonthly != null && sipMonthly !== "0" && changeDirection(sipMonthly) === "up";
  if (hasSip) {
    lines.push(`${formatRupees(sipMonthly)} in active SIPs scheduled this month`);
  }

  return lines;
}

export function coverageHeadline(coverage: LookthroughCoverage): {
  pct: string;
  excluded: Array<{ scheme_id: string; scheme_name: string; reason: string }>;
} {
  const pct = formatPercent(coverage.covered_value_pct, { digits: 1 });
  const excluded: Array<{ scheme_id: string; scheme_name: string; reason: string }> = [];
  const seenSchemes = new Set<string>();

  const groups: Array<{ funds: typeof coverage.not_published_yet; reason: string }> = [
    { funds: coverage.not_published_yet, reason: "Holdings not published yet" },
    { funds: coverage.not_available_from_amc, reason: "Not available from the AMC" },
    { funds: coverage.missing_value_schemes, reason: "No current value" },
  ];

  for (const group of groups) {
    for (const fund of group.funds) {
      if (!seenSchemes.has(fund.scheme_id)) {
        seenSchemes.add(fund.scheme_id);
        excluded.push({
          scheme_id: fund.scheme_id,
          scheme_name: fund.scheme_name,
          reason: group.reason,
        });
      }
    }
  }

  return { pct, excluded };
}

export function excludedFundCount(coverage: LookthroughCoverage): number {
  return coverageHeadline(coverage).excluded.length;
}

export type SortKey = "invested" | "value" | "gain" | "xirr" | "today_change";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export function parseSortParams(search: string): SortState | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const key = params.get("sort");
  if (!key) return null;
  const validKeys: SortKey[] = ["invested", "value", "gain", "xirr", "today_change"];
  if (!validKeys.includes(key as SortKey)) return null;

  const dirParam = params.get("dir");
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  return { key: key as SortKey, dir };
}

export function nextSort(current: SortState | null, key: SortKey): SortState {
  if (!current || current.key !== key) {
    return { key, dir: "desc" };
  }
  return { key, dir: current.dir === "desc" ? "asc" : "desc" };
}

export function sortHoldings(
  rows: HoldingRow[],
  sort: SortState | null,
  xirrByScheme: Record<string, string | null | undefined>
): HoldingRow[] {
  const copy = [...rows];
  if (!sort) return copy;

  function getSortValue(row: HoldingRow): string | null {
    switch (sort!.key) {
      case "invested":
        return row.amount_invested;
      case "value":
        return row.nav_unavailable ? null : row.current_value;
      case "gain":
        return row.nav_unavailable ? null : row.unrealized_gain;
      case "xirr":
        return xirrByScheme[row.scheme_id] ?? null;
      case "today_change":
        return todayChangePct(row);
    }
  }

  return copy.sort((a, b) => {
    const valA = getSortValue(a);
    const valB = getSortValue(b);

    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;

    const cmp = compareDecimalStrings(valA, valB);
    return sort!.dir === "asc" ? cmp : cmp === 0 ? 0 : cmp === 1 ? -1 : 1;
  });
}

export function sparkPoints(points: HistoryPoint[]): string {
  const n = points.length;
  if (n < 2) return "";

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const round1 = (x: number) => Math.round(x * 10) / 10;

  const coords = points.map((p, index) => {
    const x = round1((index * 72) / (n - 1));
    const y = min === max ? 13 : round1(24 - ((p.value - min) / (max - min)) * 22);
    return `${x},${y}`;
  });

  return coords.join(" ");
}

export function sparkTrend(points: HistoryPoint[]): "up" | "down" | "flat" {
  if (points.length < 2) return "flat";
  const first = points[0];
  const last = points[points.length - 1];
  const cmp = compareDecimalStrings(last.valueText, first.valueText);
  if (cmp > 0) return "up";
  if (cmp < 0) return "down";
  return "flat";
}
