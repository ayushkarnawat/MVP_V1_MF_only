import { NO_CHANGE } from "../planningCopy";
import { barScale } from "../scenarioFormat";

export type BarTone = "gain" | "loss" | "index";

export interface BarRow {
  key: string;
  label: string;
  value: string;
  text: string;
  tone: BarTone;
  name?: string;
}

export interface DivergingBarsProps {
  rows: BarRow[];
  ariaLabel: string;
}

export function DivergingBars({ rows, ariaLabel }: DivergingBarsProps) {
  const scale = barScale(rows.map(row => row.value));
  const percent = (x: number) => `${Math.round(x * 100) / 100}%`;

  if (rows.length === 0 || scale.widths.every(w => w === 0)) {
    return <p className="text-sm text-[var(--ui-text-muted)]">{NO_CHANGE}</p>;
  }

  return (
    <ul aria-label={ariaLabel} className="m-0 list-none p-0">
      {rows.map((row, index) => {
        const side = scale.sides[index];
        const width = percent(scale.widths[index]);
        const barStyle =
          side === "left"
            ? { right: percent(100 - scale.zero), width }
            : { left: percent(scale.zero), width };

        const fill =
          row.tone === "gain"
            ? "bg-[var(--pos)]"
            : row.tone === "loss"
              ? "bg-[var(--neg)]"
              : "bg-[var(--c3)]";

        const textClass =
          row.tone === "gain"
            ? "text-[var(--pos-text)]"
            : row.tone === "loss"
              ? "text-[var(--neg-text)]"
              : "text-[var(--ui-text)]";

        return (
          <li
            key={row.key}
            data-testid={`bar-${row.key}`}
            data-tone={row.tone}
            tabIndex={0}
            aria-label={row.name ?? `${row.label}, ${row.text}`}
            className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
          >
            <span
              data-testid={`bar-label-${row.key}`}
              className="min-w-0 break-words text-[var(--ui-text)]"
            >
              {row.label}
            </span>
            <span
              data-testid={`bar-track-${row.key}`}
              aria-hidden="true"
              className="relative h-[10px]"
            >
              <span
                data-testid={`bar-zero-${row.key}`}
                className="absolute -bottom-[3px] -top-[3px] w-px bg-[var(--ui-divider)]"
                style={{ left: percent(scale.zero) }}
              />
              <span
                data-testid={`bar-fill-${row.key}`}
                data-side={side}
                data-tone={row.tone}
                className={`absolute top-px h-2 rounded-[3px] ${fill}`}
                style={barStyle}
              />
            </span>
            <span
              data-testid={`bar-text-${row.key}`}
              className={`whitespace-nowrap text-right font-semibold tabular-nums ${textClass}`}
            >
              {row.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
