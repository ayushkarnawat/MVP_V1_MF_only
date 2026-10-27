import { Activity, BarChart3 } from "lucide-react";
import { useState } from "react";
import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings } from "../../../lib/decimal";
import { formatDate } from "../../../lib/format";
import { ChartTypeToggle } from "../common/charts";
import type { ValuationSummary } from "../types";
import {
  barWidths,
  deltaSentence,
  KIND_TEXT,
  pinPositions,
  ratioRows,
  ratioState,
  ratioText,
  type ValuationKind,
} from "./otherLogic";

export interface ValuationSpectrumProps {
  data: ValuationSummary;
}

interface PanelProps {
  data: ValuationSummary;
  kind: ValuationKind;
  view: "spectrum" | "bars";
}

function Panel({ data, kind, view }: PanelProps) {
  const { label, basis } = KIND_TEXT[kind];
  const metric = data[kind];
  const state = ratioState(data, kind);
  const rows = ratioRows(data, kind);
  const positions = pinPositions(rows);
  const widths = barWidths(rows);
  const delta = deltaSentence(data, kind);

  return (
    <div
      data-testid={`panel-${kind}`}
      role="group"
      aria-label={`${label} valuation`}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5"
    >
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-[var(--ui-text)]">
          {label} · {basis}
        </h4>
        <p data-testid={`coverage-${kind}`} className="text-xs text-[var(--ui-text-muted)]">
          Ratio data cover {formatLookthroughPercent(metric.coverage_pct, 1)}% of equity exposure · Fundamentals as on {formatDate(metric.as_of_date)}
        </p>
      </div>

      {state !== "ok" && (
        <p data-testid={`state-${kind}`} data-state={state} className="rounded-lg bg-[var(--ui-elevated)] p-2.5 text-xs text-[var(--ui-text-muted)]">
          {state === "hidden"
            ? "Portfolio ratio hidden while published holdings cover less than 50% of your portfolio."
            : `Not enough data for portfolio ${label} — at least 70% of equity exposure needs a usable ratio.`}
        </p>
      )}

      {view === "spectrum" ? (
        <div data-testid={`spectrum-${kind}`} className="relative h-14 pt-2">
          <div className="relative h-2 rounded-full bg-[var(--ui-divider)] mx-2 my-4" aria-hidden="true" />
          {rows.map(row => {
            const pos = positions[row.key];
            if (pos === null) return null;
            const tip = `${row.label} ${ratioText(row.ratio)}`;
            return (
              <span
                key={row.key}
                data-testid={`pin-${kind}-${row.key}`}
                data-series={row.key}
                data-color={row.color}
                data-x={pos}
                tabIndex={0}
                title={tip}
                data-tooltip={tip}
                style={{ left: `${pos}%`, color: row.color }}
                className="absolute top-1 -translate-x-1/2 flex flex-col items-center gap-1 text-[11px] font-semibold"
              >
                <span>
                  {row.short} {ratioText(row.ratio)}
                </span>
                <span
                  className="h-3 w-3 rounded-full ring-2 ring-[var(--ui-card)]"
                  style={{ backgroundColor: row.color }}
                />
              </span>
            );
          })}
        </div>
      ) : (
        <ul aria-label={`${label} comparison bars`} className="space-y-3 pt-2">
          {rows.map(row => (
            <li
              key={row.key}
              data-testid={`vbar-${kind}-${row.key}`}
              data-series={row.key}
              data-color={row.color}
              className="space-y-1 text-xs"
            >
              <div className="flex justify-between font-medium text-[var(--ui-text)]">
                <span>{row.label}</span>
                <span>{row.ratio === null ? "Unavailable" : ratioText(row.ratio)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ui-divider)]" aria-hidden="true">
                <span
                  data-testid={`vbar-fill-${kind}-${row.key}`}
                  style={{ width: `${widths[row.key]}%`, backgroundColor: row.color }}
                  className="block h-full rounded-full transition-all"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {delta && (
        <p data-testid={`delta-${kind}`} className="text-xs text-[var(--ui-text-muted)] pt-1">
          {delta}
        </p>
      )}

      {metric.missing.length > 0 && (
        <div data-testid={`excluded-${kind}`} className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3 space-y-2 mt-2">
          <h5 className="text-xs font-semibold text-[var(--ui-text)]">
            Equity holdings excluded from {label}
          </h5>
          <ul aria-label={`Excluded from ${label}`} className="space-y-1 text-xs text-[var(--ui-text-muted)]">
            {metric.missing.map((item, idx) => (
              <li key={item.isin ?? `${item.instrument_name}-${idx}`}>
                {item.instrument_name} · {formatLookthroughPercent(item.percentage_equity, 1)}% of equity — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ValuationSpectrum({ data }: ValuationSpectrumProps) {
  const [view, setView] = useState<"spectrum" | "bars">("spectrum");

  const hasNoEquity = compareDecimalStrings(data.total_equity_value, "0") === 0;

  return (
    <div data-testid="valuation-body" className="space-y-5">
      <p data-testid="valuation-dates" className="text-xs text-[var(--ui-text-muted)]">
        Values as on {formatDate(data.nav_as_of)} · Holdings as on {formatDate(data.holdings_as_of)}.
      </p>

      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />

      <p data-testid="valuation-thresholds" className="text-xs text-[var(--ui-text-muted)]">
        {'Ratios are hidden below 50% look-through coverage and flagged "not enough data" below 70% of equity exposure.'}
      </p>

      {hasNoEquity ? (
        <p data-testid="valuation-no-equity" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 text-sm text-[var(--ui-text-muted)]">
          No equity holdings for this selection
        </p>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <ChartTypeToggle
              label="Valuation view"
              value={view}
              onChange={setView}
              options={[
                { id: "spectrum", label: "Racetrack", icon: Activity },
                { id: "bars", label: "Bar Chart", icon: BarChart3 },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel data={data} kind="pe" view={view} />
            <Panel data={data} kind="pb" view={view} />
          </div>
        </>
      )}

      <div className="space-y-2 text-xs text-[var(--ui-text-muted)]">
        <p>
          P/E from NSE (SYMBOL P/E, reported trailing earnings); P/B from Yahoo Finance. Portfolio ratios use a weighted harmonic mean of the equity holdings with usable data.
        </p>

        {data.footnotes && data.footnotes.length > 0 && (
          <ul aria-label="Valuation footnotes" className="list-disc pl-4 space-y-1">
            {data.footnotes.map((fn, idx) => (
              <li key={idx}>{fn}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
