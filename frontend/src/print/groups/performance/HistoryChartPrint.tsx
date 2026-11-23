import type { HistoryPoint } from "../../../features/mutual-funds/types";
import { formatCompactRupees } from "../../../lib/format";

const VIEW_W = 720;
const VIEW_H = 175;
const X_LEFT = 62;
const X_RIGHT = 708;
const Y_TOP = 14;
const Y_BOTTOM = 146;
const PLOT_W = X_RIGHT - X_LEFT;
const PLOT_H = Y_BOTTOM - Y_TOP;

interface XTick {
  year: string;
  x: number;
}

function buildXTicks(points: HistoryPoint[], getX: (i: number) => number): XTick[] {
  const yearFirstIndex = new Map<string, number>();
  const yearJanIndex = new Map<string, number>();

  points.forEach((p, idx) => {
    const year = p.month.slice(0, 4);
    if (!yearFirstIndex.has(year)) {
      yearFirstIndex.set(year, idx);
    }
    if (p.month.endsWith("-01") && !yearJanIndex.has(year)) {
      yearJanIndex.set(year, idx);
    }
  });

  const years = Array.from(yearFirstIndex.keys());
  const selectedYears =
    years.length <= 2
      ? years
      : years.filter(y => Number(y) % 2 === 0);

  const targetYears = selectedYears.length > 0 ? selectedYears : years.filter((_, i) => i % 2 === 0);

  return targetYears.map(year => {
    const idx = yearJanIndex.get(year) ?? yearFirstIndex.get(year) ?? 0;
    return { year, x: getX(idx) };
  });
}

function buildInvestedSegments(points: HistoryPoint[], getX: (i: number) => number, getY: (v: number) => number): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  points.forEach((p, i) => {
    if (p.invested !== null) {
      current.push(`${getX(i)},${getY(p.invested)}`);
    } else if (current.length > 0) {
      if (current.length >= 2) {
        segments.push(current.join(" "));
      }
      current = [];
    }
  });

  if (current.length >= 2) {
    segments.push(current.join(" "));
  }
  return segments;
}

export function HistoryChartPrint({ points, title }: { points: HistoryPoint[]; title: string }) {
  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-4">
        <h4 className="text-base font-bold text-[var(--ui-text)]">{title}</h4>
        <p className="py-8 text-center text-sm font-semibold text-[var(--ui-text)]">No history yet</p>
      </section>
    );
  }

  const vals = points.flatMap(p => [p.value, ...(p.invested !== null ? [p.invested] : [])]);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const axisMin = minVal < 0 ? minVal : 0;
  const axisMax = maxVal > axisMin ? maxVal * 1.06 : axisMin + 1;

  const n = points.length;
  const getX = (i: number) => (n === 1 ? X_LEFT + PLOT_W / 2 : X_LEFT + (i * PLOT_W) / (n - 1));
  const getY = (val: number) => Y_BOTTOM - ((val - axisMin) / (axisMax - axisMin)) * PLOT_H;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const val = axisMin + ratio * (axisMax - axisMin);
    return {
      y: getY(val),
      label: formatCompactRupees(String(Math.round(val))),
    };
  });

  const xTicks = buildXTicks(points, getX);
  const valueCoords = points.map((p, i) => `${getX(i)},${getY(p.value)}`);
  const valueLinePoints = valueCoords.join(" ");
  const areaPoints =
    n >= 2 ? `${getX(0)},${Y_BOTTOM} ${valueLinePoints} ${getX(n - 1)},${Y_BOTTOM}` : null;
  const investedSegments = buildInvestedSegments(points, getX, getY);

  return (
    <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-4">
      <h4 className="text-base font-bold text-[var(--ui-text)]">{title}</h4>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label={title}
        className="w-full h-auto"
      >
        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={X_LEFT}
              y1={tick.y}
              x2={X_RIGHT}
              y2={tick.y}
              stroke="var(--ui-divider)"
              strokeWidth="1"
            />
            <text
              x={X_LEFT - 8}
              y={tick.y + 3}
              textAnchor="end"
              fill="var(--ui-text-muted)"
              fontSize="9"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {xTicks.map(tick => (
          <text
            key={tick.year}
            x={tick.x}
            y={Y_BOTTOM + 16}
            textAnchor="middle"
            fill="var(--ui-text-muted)"
            fontSize="9"
          >
            {tick.year}
          </text>
        ))}

        {areaPoints && (
          <polygon points={areaPoints} fill="var(--pos-bg)" fillOpacity="0.65" />
        )}

        {investedSegments.map((seg, idx) => (
          <polyline
            key={idx}
            points={seg}
            fill="none"
            stroke="var(--ui-text-muted)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {n >= 2 && (
          <polyline
            points={valueLinePoints}
            fill="none"
            stroke="var(--pos)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <div className="flex items-center gap-4 text-xs text-[var(--ui-text-muted)]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--pos)]" />
          <span>Portfolio value</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--ui-text-muted)]" />
          <span>Invested</span>
        </div>
      </div>
    </section>
  );
}
