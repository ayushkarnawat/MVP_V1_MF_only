import { formatPercent } from "@/lib/format";
import type { SliceRow } from "../portfolioCopy";

export interface InstrumentDonutProps {
  rows: SliceRow[];
  centerLabel: string;
  centerValue: string;
  centerPct?: string | null;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  ariaLabel?: string;
}

const R = 70;
const STROKE = 28;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 4;
const POP = 7;
const round2 = (x: number) => Math.round(x * 100) / 100;

export function InstrumentDonut({
  rows,
  centerLabel,
  centerValue,
  centerPct = null,
  activeKey,
  onActiveChange,
  ariaLabel = "Asset allocation",
}: InstrumentDonutProps) {
  let cumulative = 0;

  return (
    <div className="relative h-[236px] w-[236px] shrink-0">
      <svg
        viewBox="0 0 200 200"
        role="group"
        aria-label={ariaLabel}
        className="h-full w-full overflow-visible"
      >
        <circle
          data-testid="donut-track"
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="var(--ui-divider)"
          strokeWidth={STROKE}
        />
        {rows.map((row) => {
          const pct = Number(row.percentage);
          const length = (pct / 100) * CIRCUMFERENCE;
          const segment = rows.length > 1 ? Math.max(length - GAP, 2) : length;
          const start = -90 + cumulative * 3.6;
          const midDeg = start + (pct * 3.6) / 2;
          const midRad = (midDeg * Math.PI) / 180;
          const dx = round2(Math.cos(midRad) * POP);
          const dy = round2(Math.sin(midRad) * POP);

          cumulative += pct;

          const active = activeKey === row.key;
          const dim = activeKey !== null && !active;

          return (
            <g
              key={row.key}
              data-testid={`slice-${row.key}`}
              data-active={active ? "true" : "false"}
              data-dim={dim ? "true" : "false"}
              role="img"
              tabIndex={0}
              aria-label={`${row.label} ${formatPercent(row.percentage, { digits: 1 })}`}
              style={{
                cursor: "pointer",
                opacity: dim ? 0.38 : 1,
                transform: active ? `translate(${dx}px, ${dy}px)` : undefined,
                transition: "transform 150ms ease, opacity 150ms ease",
              }}
              onMouseEnter={() => onActiveChange(row.key)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => onActiveChange(row.key)}
              onBlur={() => onActiveChange(null)}
            >
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={row.color}
                strokeWidth={STROKE}
                strokeDasharray={`${round2(segment)} ${round2(CIRCUMFERENCE - segment)}`}
                transform={`rotate(${round2(start)} 100 100)`}
              />
            </g>
          );
        })}
      </svg>
      <div
        data-testid="donut-center"
        className="pointer-events-none absolute inset-[42px] flex flex-col items-center justify-center rounded-full bg-[var(--ui-elevated)]"
      >
        <span
          data-testid="donut-center-label"
          className="text-xs text-[var(--ui-text-muted)] truncate max-w-[120px]"
        >
          {centerLabel}
        </span>
        <span
          data-testid="donut-center-value"
          className="text-lg font-extrabold text-[var(--ui-text-default)] tabular-nums"
        >
          {centerValue}
        </span>
        {centerPct !== null && centerPct !== undefined && (
          <span
            data-testid="donut-center-pct"
            className="text-xs font-bold text-[var(--pos-text)] tabular-nums"
          >
            {centerPct}
          </span>
        )}
      </div>
    </div>
  );
}
