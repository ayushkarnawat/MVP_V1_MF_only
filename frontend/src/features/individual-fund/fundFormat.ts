import { formatDate, formatPercent, formatRupees } from "@/lib/format";
import { formatDecimal, toPercentString } from "@/lib/decimal";
import type { PerformancePeriod, SeriesPoint, Tone } from "./types";
import type { RiskKey } from "./fundCopy";

export { formatDate };

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d*))?$/;

const MONTH_NAMES = [
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
];

export function changeDirection(
  value: string | null | undefined
): "up" | "down" | "flat" {
  if (value == null) return "flat";
  const s = String(value).trim();
  if (!s) return "flat";
  const m = s.match(DECIMAL);
  if (!m) return "flat";
  const intPart = m[2];
  const fracPart = m[3] ?? "";
  const isAllZero = /^0+$/.test(intPart) && /^0*$/.test(fracPart);
  if (isAllZero) return "flat";
  return m[1] === "-" ? "down" : "up";
}

export function formatSignedRupees(value: string | null | undefined): string {
  const formatted = formatRupees(value);
  if (formatted === "—" || formatted === "₹0" || formatted.startsWith("-")) {
    return formatted;
  }
  return `+${formatted}`;
}

export function formatSignedPercent(
  value: string | null | undefined,
  digits: number = 1
): string {
  return formatPercent(value, { digits, signed: true });
}

export function formatXirr(value: string | null | undefined): string {
  if (value == null) return "—";
  const s = String(value).trim();
  if (!s.match(DECIMAL)) return "—";
  return formatPercent(toPercentString(s), { digits: 1 });
}

function formatIndianGrouping(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function formatNav(value: string | null | undefined): string {
  if (value == null) return "—";
  const s = String(value).trim();
  if (!s.match(DECIMAL)) return "—";
  const formatted = formatDecimal(s);
  const isNeg = formatted.startsWith("-");
  const unsigned = isNeg ? formatted.slice(1) : formatted;
  const [wholeStr, fracStr] = unsigned.split(".");
  const grouped = formatIndianGrouping(wholeStr);
  const result = `₹${grouped}.${fracStr}`;
  return isNeg ? `-${result}` : result;
}

export function formatWhole(value: string | null | undefined): string {
  if (value == null) return "—";
  const s = String(value).trim();
  const m = s.match(DECIMAL);
  if (!m) return "—";
  const isNeg = m[1] === "-";
  let whole = BigInt(m[2]);
  const frac = m[3] ?? "";
  if (frac.length > 0 && frac[0] >= "5") {
    whole += 1n;
  }
  if (isNeg && whole > 0n) {
    return `-${whole.toString()}`;
  }
  return whole.toString();
}

export function shortCategory(category: string | null | undefined): string {
  if (!category) return "";
  const idx = category.indexOf(" - ");
  const text = idx !== -1 ? category.slice(idx + 3) : category;
  return text.replace(/\s+Funds?$/, "").trim();
}

export function planPill(plan: string | null | undefined): string {
  if (!plan) return "";
  const trimmed = plan.trim();
  if (!trimmed) return "";
  if (/plan$/i.test(trimmed)) return trimmed;
  return `${trimmed} Plan`;
}

export function shareLine(pct: string | null | undefined): string {
  if (pct == null) return "";
  const formatted = formatPercent(pct, { digits: 1 });
  if (formatted === "—") return "";
  return `${formatted} of portfolio`;
}

export function axisLabel(iso: string, period: PerformancePeriod): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const year = m[1];
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  if (monthNum < 1 || monthNum > 12) return "—";
  const mon = MONTH_NAMES[monthNum - 1];
  if (period === "1M" || period === "3M" || period === "6M") {
    return `${dayNum} ${mon}`;
  }
  return `${mon} ${year.slice(-2)}`;
}

export function seriesValues(
  points: SeriesPoint[] | null | undefined
): number[] {
  if (!points) return [];
  return points.map((point) => Number(point.pct));
}

export function lastPct(
  points: SeriesPoint[] | null | undefined
): string | null {
  if (!points || points.length === 0) return null;
  return points[points.length - 1].pct;
}

export function formatRiskValue(
  key: RiskKey,
  value: string | null | undefined
): string {
  if (value == null) return "—";
  const s = String(value).trim();
  if (!s.match(DECIMAL)) return "—";
  if (key === "volatility" || key === "max_drawdown") {
    return formatPercent(s, { digits: 1 });
  }
  return formatDecimal(s);
}

export function riskBarPercent(
  key: RiskKey,
  value: string | null | undefined
): number {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s.match(DECIMAL)) return 0;
  const raw = key === "max_drawdown" ? Math.abs(Number(s)) : Number(s);
  const scale =
    key === "volatility"
      ? 30
      : key === "max_drawdown"
        ? 45
        : key === "sharpe"
          ? 2
          : 1.5;
  const scaled = (raw / scale) * 100;
  const minVal = key === "sharpe" ? 4 : 0;
  const clamped = Math.min(100, Math.max(minVal, scaled));
  return Math.round(clamped * 10) / 10;
}

export function toneChipClass(tone: Tone | null | undefined): string {
  const base =
    "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold";
  switch (tone) {
    case "pos":
      return `${base} bg-[var(--pos-bg)] text-[var(--pos-text)]`;
    case "warn":
      return `${base} bg-[var(--warn-bg)] text-[var(--warn-text)]`;
    case "neg":
      return `${base} bg-[var(--neg-bg)] text-[var(--neg-text)]`;
    case "info":
      return `${base} bg-[var(--ui-card)] text-[var(--c4)]`;
    default:
      return `${base} border border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)]`;
  }
}

export function initialsOf(name: string | null | undefined): string {
  if (name == null) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters: string[] = [];
  for (const word of words) {
    const match = word.match(/\p{L}/u);
    if (match) {
      letters.push(match[0]);
    }
  }
  if (letters.length === 0) return "?";
  if (letters.length === 1) return letters[0].toUpperCase();
  return (letters[0] + letters[letters.length - 1]).toUpperCase();
}

export function fillGaps(
  values: readonly (string | null)[]
): number[] | null {
  const firstIndex = values.findIndex(
    (v) => v !== null && typeof v === "string"
  );
  if (firstIndex === -1) {
    return null;
  }
  const result: number[] = new Array(values.length);
  const firstVal = Number(values[firstIndex]);
  for (let i = 0; i < firstIndex; i++) {
    result[i] = firstVal;
  }
  let currentVal = firstVal;
  for (let i = firstIndex; i < values.length; i++) {
    const val = values[i];
    if (val !== null) {
      currentVal = Number(val);
    }
    result[i] = currentVal;
  }
  return result;
}

export function barLabel(
  bucket: "week" | "month" | "quarter" | "year",
  label: string
): string {
  if (bucket === "month") {
    const match = label.match(/^([A-Za-z]{3,9})\s+\d{4}$/);
    if (match) {
      return match[1].slice(0, 3);
    }
  }
  return label;
}

