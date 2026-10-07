import type { HistoryPoint } from "./api";
import { formatIndianCurrency } from "../../lib/decimal";

function monthName(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`));
}

const W = 640;
const H = 200;
const PAD = { left: 8, right: 8, top: 16, bottom: 8 };

/** Plain SVG line chart (no chart library is installed): monthly value over
 * the invested area; a partial month is a hollow dot naming the funds that
 * had no price. Colours come from CSS variables, so dark mode works. */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => Math.max(p.value, p.invested ?? 0)), 1);
  const x = (i: number) => PAD.left + (points.length === 1 ? 0 : (i * (W - PAD.left - PAD.right)) / (points.length - 1));
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const hasInvested = points.every((p) => p.invested !== null);
  const area = hasInvested
    ? `M${x(0)},${y(0)} ` + points.map((p, i) => `L${x(i).toFixed(1)},${y(p.invested ?? 0).toFixed(1)}`).join(" ") + ` L${x(points.length - 1)},${y(0)} Z`
    : null;
  const last = points[points.length - 1];
  return (
    <div className="w-full">
      <div className="flex justify-end text-xs font-semibold text-[var(--color-accent)] tabular-nums">
        value ₹{formatIndianCurrency(last.value)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Portfolio value by month">
        {area && <path d={area} fill="var(--color-accent)" fillOpacity={0.12} />}
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={p.month}
            data-point
            cx={x(i)}
            cy={y(p.value)}
            r={p.partial ? 4.5 : 2}
            fill={p.partial ? "var(--color-surface)" : "var(--color-accent)"}
            stroke={p.partial ? "var(--color-warning)" : "none"}
            strokeWidth={p.partial ? 2 : 0}
          >
            {p.partial && <title>{`${p.missing.join(", ")} had no price this month`}</title>}
          </circle>
        ))}
      </svg>
      {/* Children of an svg role="img" are presentational, so the partial
          months are listed for screen readers here (6B review #9). */}
      {points.some((p) => p.partial) && (
        <ul className="sr-only" aria-label="Months with a missing price">
          {points.filter((p) => p.partial).map((p) => (
            <li key={p.month}>{`${monthName(p.month)}: ${p.missing.join(", ")} had no price this month`}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-between text-xs text-[var(--color-text-secondary)] tabular-nums">
        <span>{points[0].month.slice(0, 4)}</span>
        <span>{last.month.slice(0, 4)}</span>
      </div>
    </div>
  );
}
