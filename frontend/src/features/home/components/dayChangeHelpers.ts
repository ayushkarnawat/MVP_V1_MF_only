import { changeDirection, formatDate, formatDayMonth } from "../homeFormat";
import { istToday } from "../../../lib/homeToday";
import type { MoverAllBarOut, MoversView } from "../types";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function parseToPaise(value: string | null | undefined): bigint {
  if (value == null) return 0n;
  const trimmed = String(value).trim();
  if (!trimmed) return 0n;
  const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return 0n;
  const negative = match[1] === "-";
  const whole = BigInt(match[2]);
  const fracRaw = match[3] ?? "";
  const frac3 = (fracRaw + "000").slice(0, 3);
  let paise = whole * 100n + BigInt(frac3.slice(0, 2));
  if (frac3[2] >= "5") {
    paise += 1n;
  }
  return negative ? -paise : paise;
}

function absPaise(value: string): bigint {
  const paise = parseToPaise(value);
  return paise < 0n ? -paise : paise;
}

function compareByMagnitudeDesc(a: MoverAllBarOut, b: MoverAllBarOut): number {
  const diff = absPaise(b.change) - absPaise(a.change);
  if (diff > 0n) return 1;
  if (diff < 0n) return -1;
  return a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
}

export interface PartitionedMoverRows {
  gainers: MoverAllBarOut[];
  losers: MoverAllBarOut[];
  noChange: MoverAllBarOut[];
}

export function partitionMoverRows(rows: MoverAllBarOut[]): PartitionedMoverRows {
  const gainers: MoverAllBarOut[] = [];
  const losers: MoverAllBarOut[] = [];
  const noChange: MoverAllBarOut[] = [];

  for (const row of rows) {
    const dir = changeDirection(row.change);
    if (row.no_change || dir === "flat") {
      noChange.push(row);
    } else if (dir === "up") {
      gainers.push(row);
    } else {
      losers.push(row);
    }
  }

  gainers.sort(compareByMagnitudeDesc);
  losers.sort(compareByMagnitudeDesc);
  noChange.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));

  return { gainers, losers, noChange };
}

function parseIsoCalendarDate(iso: string | null | undefined): {
  year: number;
  month: number;
  day: number;
  ymd: string;
} | null {
  if (!iso) return null;
  const trimmed = String(iso).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, ymd: `${match[1]}-${match[2]}-${match[3]}` };
}

export function extractIstYmd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return istToday(date);
}

/** Formats an ISO calendar date (YYYY-MM-DD) as "Friday 23 Oct 2026" via UTC lookup. */
export function formatWeekdayDate(iso: string | null | undefined): string {
  const parsed = parseIsoCalendarDate(iso);
  if (!parsed) return formatDate(iso);
  const weekdayIndex = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  const formatted = formatDate(parsed.ymd);
  if (formatted === "—") return "—";
  return `${WEEKDAYS[weekdayIndex]} ${formatted}`;
}

export function formatDialogDateLine(
  computedAt: string | null | undefined,
  navAsOf: string | null | undefined,
): string {
  const computedYmd = extractIstYmd(computedAt) ?? parseIsoCalendarDate(navAsOf)?.ymd ?? null;
  const datePart = computedYmd ? formatWeekdayDate(computedYmd) : null;
  const pricesDayMonth = formatDayMonth(navAsOf);

  if (datePart && datePart !== "—" && pricesDayMonth !== "—") {
    return `${datePart} · prices as on ${pricesDayMonth}`;
  }
  if (datePart && datePart !== "—") {
    return datePart;
  }
  if (pricesDayMonth !== "—") {
    return `Prices as on ${pricesDayMonth}`;
  }
  return "Today";
}

export function groupUnitLabel(view: MoversView, count: number): string {
  if (view === "category") {
    return count === 1 ? "1 category" : `${count} categories`;
  }
  if (view === "sector") {
    return count === 1 ? "1 sector" : `${count} sectors`;
  }
  return count === 1 ? "1 fund" : `${count} funds`;
}

export function sectorRowSubtitle(fundCount: number): string {
  if (fundCount <= 0) return "";
  if (fundCount === 1) return "across 1 fund";
  return `across ${fundCount} funds`;
}
