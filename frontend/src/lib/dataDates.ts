export type DataDateKind =
  | "prices"
  | "holdings"
  | "ratios"
  | "fees"
  | "marketCapList"
  | "factsheet"
  | "managerDetails";

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

const FULL_MONTHS = [
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

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(iso: string | null | undefined): CalendarDate | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;

  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;

  return { year, month, day };
}

type KindFormat =
  | { tier: "day"; prefix: string }
  | { tier: "month"; prefix: string };

const KIND_FORMAT: Record<DataDateKind, KindFormat> = {
  prices: { tier: "day", prefix: "Prices as on" },
  ratios: { tier: "day", prefix: "Ratios as on" },
  holdings: { tier: "month", prefix: "Holdings as on" },
  fees: { tier: "month", prefix: "Fees as on" },
  factsheet: { tier: "month", prefix: "Factsheet as on" },
  managerDetails: { tier: "month", prefix: "Manager details as on" },
  marketCapList: { tier: "day", prefix: "Market-cap list effective" },
};

const OLDER_THRESHOLD_DAYS: Partial<Record<DataDateKind, number>> = {
  holdings: 60,
  marketCapList: 200,
  factsheet: 200,
};

const MS_PER_DAY = 86_400_000;

/**
 * Formats an ISO date or date-time string according to the Batch E data-date policy.
 * Returns an empty string for invalid, empty, or null inputs.
 */
export function formatDataDate(kind: DataDateKind, iso: string | null | undefined): string {
  const parsed = parseCalendarDate(iso);
  if (!parsed) return "";

  const spec = KIND_FORMAT[kind];
  if (spec.tier === "day") {
    return `${spec.prefix} ${parsed.day} ${SHORT_MONTHS[parsed.month - 1]} ${parsed.year}`;
  }
  return `${spec.prefix} ${FULL_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Returns whether a data date is older than its expected cadence relative to `today`.
 * Kinds without a defined cadence always return `{ older: false, label: null }`.
 */
export function olderDataMarker(
  kind: DataDateKind,
  iso: string | null | undefined,
  today: Date,
): { older: boolean; label: string | null } {
  const threshold = OLDER_THRESHOLD_DAYS[kind];
  if (threshold === undefined) {
    return { older: false, label: null };
  }
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) {
    return { older: false, label: null };
  }

  const parsed = parseCalendarDate(iso);
  if (!parsed) {
    return { older: false, label: null };
  }

  const dataUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const ageDays = (todayUtc - dataUtc) / MS_PER_DAY;

  if (ageDays > threshold) {
    return { older: true, label: "Older than usual" };
  }
  return { older: false, label: null };
}
