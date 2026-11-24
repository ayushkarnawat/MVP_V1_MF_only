import type { HistoryPoint } from "../../../features/mutual-funds/types";
import { diffDecimalStrings } from "../../../lib/decimal";
import { formatPercent, formatRupees } from "../../../lib/format";

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

function parseAsOf(asOf: string | null): { year: string; day: number; monthName: string } | null {
  if (!asOf) return null;
  const match = asOf.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (!match) return null;
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;
  return {
    year: match[1],
    day,
    monthName: SHORT_MONTHS[monthIdx],
  };
}

// A point's month may be "YYYY-MM" or a full ISO date: the month is always its first seven characters.
const isDecember = (point: HistoryPoint) => point.month.slice(0, 7).endsWith("-12");

function selectYearEndPoints(points: HistoryPoint[]): Array<{ year: string; point: HistoryPoint }> {
  const byYear = new Map<string, HistoryPoint>();

  for (const p of points) {
    const year = p.month.slice(0, 4);
    const existing = byYear.get(year);
    if (!existing || !isDecember(existing) || isDecember(p)) {
      byYear.set(year, p);
    }
  }

  return Array.from(byYear.entries()).map(([year, point]) => ({ year, point }));
}

function formatSignedGainRupees(gain: string): string {
  const formatted = formatRupees(gain);
  if (formatted === "—" || formatted === "₹0" || formatted.startsWith("-")) {
    return formatted;
  }
  return `+${formatted}`;
}

// The gain is exact decimal arithmetic on the text figures; only the final percentage takes a Number for display.
function formatGainPercent(gain: string, invested: string): string {
  const base = Number(invested);
  if (!Number.isFinite(base) || base === 0) return "-";
  const pct = (Number(gain) / base) * 100;
  const str = Math.abs(pct) < 1e-6 ? "0" : String(pct);
  return formatPercent(str, { digits: 1, signed: true });
}

export function YearByYearTable({ points, asOf }: { points: HistoryPoint[]; asOf: string | null }) {
  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-4">
        <h4 className="text-base font-bold text-[var(--ui-text)]">Year by year</h4>
        <p className="py-8 text-center text-sm font-semibold text-[var(--ui-text)]">No history yet</p>
      </section>
    );
  }

  const rows = selectYearEndPoints(points);
  const parsedAsOf = parseAsOf(asOf);

  return (
    <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-4">
      <h4 className="text-base font-bold text-[var(--ui-text)]">Year by year</h4>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--ui-divider)] bg-[var(--ui-card)] text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
            <th className="px-3 py-2 text-left">Year end</th>
            <th className="px-3 py-2 text-right">Invested</th>
            <th className="px-3 py-2 text-right">Value</th>
            <th className="px-3 py-2 text-right">Gain</th>
            <th className="px-3 py-2 text-right">Gain %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ year, point }) => {
            const isPartialYear =
              parsedAsOf !== null &&
              parsedAsOf.year === year &&
              !isDecember(point);
            const yearLabel = isPartialYear
              ? `${year} (to ${parsedAsOf.day} ${parsedAsOf.monthName})`
              : year;

            const valueText = point.valueText || String(point.value);
            const investedText = point.investedText ?? (point.invested === null ? null : String(point.invested));
            const valueDisplay = formatRupees(valueText);
            const hasInvested = investedText !== null;
            const gain = hasInvested ? diffDecimalStrings(valueText, investedText) : "0";

            return (
              <tr
                key={year}
                className="border-b border-[var(--ui-divider)] last:border-b-0 text-[var(--ui-text)] break-inside-avoid"
              >
                <td className="px-3 py-2 text-left">{yearLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hasInvested ? formatRupees(investedText) : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{valueDisplay}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hasInvested ? formatSignedGainRupees(gain) : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hasInvested ? formatGainPercent(gain, investedText) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
