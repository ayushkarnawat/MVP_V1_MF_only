import { BarChart3, PieChart } from "lucide-react";
import { useMemo, useState } from "react";
import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { formatCompactRupees, formatDate, formatPercent, formatRupees } from "../../../lib/format";
import { BarList, ChartTypeToggle } from "../common/charts";
import { SectionCard } from "../common/SectionCard";
import { percentOf } from "../mfCopy";
import type { AssetAllocationSummary, AssetClassKey } from "../types";
import {
  type AnalyticsCardProps,
  assetSlices,
  CAP_LABELS,
  chartPct,
  classFunds,
  colorAt,
  hasNegative,
  largestSlice,
  outerArcs,
} from "./allocationLogic";
import { DrillPanel } from "./DrillPanel";

const CHART_OPTIONS = [
  { id: "donut" as const, label: "Donut", icon: PieChart },
  { id: "bar" as const, label: "Bar Chart", icon: BarChart3 },
];

export function AssetClassCard({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<AssetAllocationSummary>) {
  const [asCash, setAsCash] = useState(false);
  const [chartType, setChartType] = useState<"donut" | "bar">("donut");
  const [selected, setSelected] = useState<AssetClassKey | null>(null);
  const [hovered, setHovered] = useState<AssetClassKey | null>(null);

  const variant = data
    ? asCash
      ? data.arbitrage_as_cash
      : data.as_disclosed
    : null;

  const slices = useMemo(() => {
    return variant ? assetSlices(variant) : [];
  }, [variant]);

  const validSelected = slices.some(s => s.key === selected) ? selected : null;
  const focus = hovered ?? validSelected;

  const arcs = useMemo(() => {
    return variant ? outerArcs(variant) : [];
  }, [variant]);

  const isCoveredEmpty =
    !data ||
    data.covered_value === "0" ||
    data.covered_value === "0.00" ||
    data.covered_value === "0.0";

  const largest = useMemo(() => largestSlice(slices), [slices]);
  const containsNegative = useMemo(() => hasNegative(slices), [slices]);

  const selectedSlice = validSelected ? slices.find(s => s.key === validSelected) ?? null : null;
  const funds = variant && validSelected ? classFunds(variant, validSelected) : null;

  const R_OUTER = 88;
  const R_INNER = 56;
  const C_OUTER = 2 * Math.PI * R_OUTER;
  const C_INNER = 2 * Math.PI * R_INNER;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  let cumOuter = 0;
  let cumInner = 0;

  return (
    <SectionCard
      title="Look-Through Asset Allocation"
      info="What your money is really in once mutual fund holdings are looked through to equity, debt, gold and cash-like instruments."
      state={state}
      onRetry={onRetry}
    >
      {isCoveredEmpty ? (
        <p className="text-xs text-[var(--ui-text-muted)]">
          No look-through asset allocation data available
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p data-testid="as-on" className="text-xs text-[var(--ui-text-muted)]">
            Values as on {formatDate(data.nav_as_of)} · Holdings as on {formatDate(data.holdings_as_of)}
          </p>

          <p className="text-xs text-[var(--ui-text-muted)]">
            Percentages of covered portfolio value — differs slightly from Market Cap below, which is scoped to total portfolio or equity only. Equity's outer ring breaks into Large/Mid/Small/Other; debt, gold and cash-like stay undivided.
          </p>

          <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />

          {/* Arbitrage toggle */}
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--ui-text)]">
              <input
                type="checkbox"
                data-testid="arbitrage-toggle"
                checked={asCash}
                aria-checked={asCash ? "true" : "false"}
                data-clickable=""
                data-effect="switch"
                onChange={e => setAsCash(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--ui-divider)] text-[var(--pos)]"
              />
              <span>Treat arbitrage funds as cash-like</span>
            </label>
            <p data-testid="arbitrage-note" className="text-xs text-[var(--ui-text-muted)]">
              {data.arbitrage_funds.length > 0
                ? `Applies to ${data.arbitrage_funds.map(f => f.scheme_name).join(", ")}. Entire fund value moves to cash-like; Equity Savings is unchanged.`
                : "No covered Arbitrage Fund holdings for this selection."}
            </p>
          </div>

          <ChartTypeToggle
            label="Chart type"
            value={chartType}
            options={CHART_OPTIONS}
            onChange={setChartType}
          />

          {chartType === "donut" ? (
            <div className="flex flex-wrap items-center gap-8">
              {/* Nested Donut */}
              <div className="relative h-[236px] w-[236px] shrink-0">
                <svg
                  viewBox="0 0 200 200"
                  role="img"
                  aria-label="Asset class chart"
                  className="h-full w-full overflow-visible"
                >
                  <circle
                    cx="100"
                    cy="100"
                    r={R_OUTER}
                    strokeWidth={20}
                    stroke="var(--ui-divider)"
                    fill="none"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r={R_INNER}
                    strokeWidth={20}
                    stroke="var(--ui-divider)"
                    fill="none"
                  />

                  {/* Outer ring */}
                  {arcs.map(arc => {
                    const pct = Math.max(0, Number(arc.pct));
                    const length = (pct / 100) * C_OUTER;
                    const segment = Math.max(length - 1, 0);
                    const startDeg = -90 + cumOuter * 3.6;
                    cumOuter += pct;
                    const isDim = focus !== null && focus !== arc.classKey;

                    return (
                      <g
                        key={`outer-${arc.key}-${arc.classKey}`}
                        data-testid={`outer-${arc.key}`}
                        data-class={arc.classKey}
                        data-dim={isDim ? "true" : "false"}
                        style={{ opacity: isDim ? 0.38 : 1 }}
                        aria-hidden="true"
                      >
                        <circle
                          cx="100"
                          cy="100"
                          r={R_OUTER}
                          fill="none"
                          stroke={arc.color}
                          strokeWidth={20}
                          strokeDasharray={`${round2(segment)} ${round2(C_OUTER - segment)}`}
                          transform={`rotate(${round2(startDeg)} 100 100)`}
                        />
                      </g>
                    );
                  })}

                  {/* Inner ring */}
                  {slices.map(slice => {
                    const pct = Math.max(0, Number(slice.pct));
                    const length = (pct / 100) * C_INNER;
                    const segment = Math.max(length - 1, 0);
                    const startDeg = -90 + cumInner * 3.6;
                    cumInner += pct;
                    const isDim = focus !== null && focus !== slice.key;
                    const isSelected = validSelected === slice.key;

                    return (
                      <g
                        key={`inner-${slice.key}`}
                        data-testid={`inner-${slice.key}`}
                        data-class={slice.key}
                        data-dim={isDim ? "true" : "false"}
                        style={{ opacity: isDim ? 0.38 : 1 }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={`${slice.label} ${formatPercent(slice.pct, { digits: 1 })}`}
                        data-clickable=""
                        data-effect="select"
                        onMouseEnter={() => setHovered(slice.key as AssetClassKey)}
                        onFocus={() => setHovered(slice.key as AssetClassKey)}
                        onMouseLeave={() => setHovered(null)}
                        onBlur={() => setHovered(null)}
                        onClick={() =>
                          setSelected(validSelected === slice.key ? null : (slice.key as AssetClassKey))
                        }
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (e.key === " ") e.preventDefault();
                            setSelected(
                              validSelected === slice.key ? null : (slice.key as AssetClassKey)
                            );
                          }
                        }}
                      >
                        <circle
                          cx="100"
                          cy="100"
                          r={R_INNER}
                          fill="none"
                          stroke={slice.color}
                          strokeWidth={20}
                          strokeDasharray={`${round2(segment)} ${round2(C_INNER - segment)}`}
                          transform={`rotate(${round2(startDeg)} 100 100)`}
                        />
                      </g>
                    );
                  })}
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span
                    data-testid="donut-centre-label"
                    className="text-xs text-[var(--ui-text-muted)]"
                  >
                    Covered value
                  </span>
                  <span
                    data-testid="donut-centre-value"
                    className="text-sm font-semibold text-[var(--ui-text)]"
                  >
                    {formatCompactRupees(data.covered_value)}
                  </span>
                </div>
              </div>

              {/* Legend */}
              <ul
                aria-label="Look-through asset breakdown"
                className="flex flex-col gap-2 min-w-[200px]"
              >
                {slices.map(slice => {
                  const isSelected = validSelected === slice.key;
                  return (
                    <li
                      key={slice.key}
                      data-testid={`legend-${slice.key}`}
                      onMouseEnter={() => setHovered(slice.key as AssetClassKey)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        data-clickable=""
                        data-effect="select"
                        onClick={() =>
                          setSelected(validSelected === slice.key ? null : (slice.key as AssetClassKey))
                        }
                        className={`flex w-full items-center justify-between gap-3 rounded-lg p-2 text-xs transition-colors ${
                          isSelected
                            ? "bg-[var(--ui-row-hover)] font-semibold"
                            : "hover:bg-[var(--ui-row-hover)]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          style={{ backgroundColor: slice.color }}
                          className="h-3 w-3 rounded-full shrink-0"
                        />
                        <span className="text-[var(--ui-text)]">{slice.label}</span>
                        <span className="font-medium text-[var(--ui-text-muted)]">
                          {formatPercent(slice.pct, { digits: 1 })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <BarList
              items={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
              selectedKey={validSelected}
              onSelect={k =>
                setSelected(validSelected === k ? null : (k as AssetClassKey))
              }
              formatValue={item => {
                const sl = slices.find(s => s.key === item.key);
                return formatPercent(sl?.pct ?? item.pct, { digits: 1 });
              }}
              ariaLabel="Look-through asset breakdown"
            />
          )}

          {/* Equity outer breakdown */}
          {variant && (
            <ul
              aria-label="Equity outer breakdown"
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ui-text-muted)]"
            >
              {variant.equity_outer.map((cap, index) => (
                <li key={cap.key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: colorAt(index + 3) }}
                    className="h-2.5 w-2.5 rounded-full"
                  />
                  <span>
                    {CAP_LABELS[cap.key]}: {formatPercent(cap.percentage, { digits: 1 })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!data.hide_headlines && largest && (
            <p data-testid="largest-asset-class" className="text-xs font-medium text-[var(--ui-text)]">
              Largest asset class: {largest.label} ({formatPercent(largest.pct, { digits: 1 })})
            </p>
          )}

          {containsNegative && (
            <p className="text-xs text-[var(--ui-text-muted)]">
              Negative net positions are listed with their signed percentages; the donut shows positive exposures.
            </p>
          )}

          {/* Drill panel */}
          {selectedSlice && variant && (
            <DrillPanel title={selectedSlice.label} color={selectedSlice.color}>
              <ul className="flex flex-col gap-1 text-xs">
                <li data-testid="drill-class-total" className="font-medium text-[var(--ui-text)]">
                  {selectedSlice.label} total: {formatRupees(selectedSlice.value)} ·{" "}
                  {formatPercent(selectedSlice.pct, { digits: 1 })}
                </li>
                {validSelected === "equity" &&
                  variant.equity_outer.map(cap => (
                    <li
                      key={cap.key}
                      data-testid={`drill-cap-${cap.key.toLowerCase()}`}
                      className="text-[var(--ui-text-muted)]"
                    >
                      {CAP_LABELS[cap.key]}: {formatRupees(cap.value)} ·{" "}
                      {formatPercent(percentOf(cap.value, selectedSlice.value), { digits: 1 })} of equity
                    </li>
                  ))}
              </ul>

              {funds !== null && funds.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <p data-testid="drill-funds-title" className="text-xs font-semibold text-[var(--ui-text)]">
                    Contributing funds
                  </p>
                  <ul aria-label="Contributing funds" className="flex flex-col gap-1 text-xs">
                    {funds.map(fund => (
                      <li
                        key={fund.scheme_id}
                        data-testid={`drill-fund-${fund.scheme_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ui-divider)] px-3 py-2"
                      >
                        <span data-testid={`drill-fund-name-${fund.scheme_id}`} className="text-[var(--ui-text)]">
                          {fund.scheme_name}
                        </span>
                        <span data-testid={`drill-fund-value-${fund.scheme_id}`} className="font-medium text-[var(--ui-text)]">
                          {`${formatRupees(fund.value)} · ${formatPercent(fund.percentage, { digits: 1 })} of ${selectedSlice.label}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {funds !== null && funds.length === 0 && (
                <p data-testid="drill-funds-empty" className="mt-3 text-xs text-[var(--ui-text-muted)]">
                  No fund adds a positive amount to this class.
                </p>
              )}

              {validSelected === "equity" ? (
                <button
                  type="button"
                  data-clickable=""
                  data-effect="navigate"
                  onClick={() => {
                    const el = document.getElementById("market-cap");
                    if (el && typeof el.scrollIntoView === "function") {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                  className="mt-3 text-xs font-medium text-[var(--pos-text)] hover:underline self-start"
                >
                  See the stock-level split in Market-Cap Allocation
                </button>
              ) : funds === null ? (
                <p data-testid="drill-gap-note" className="mt-2 text-xs text-[var(--ui-text-muted)]">
                  A fund-by-fund breakdown isn't available for this class yet; the look-through produces one total for it.
                </p>
              ) : null}
            </DrillPanel>
          )}
        </div>
      )}
    </SectionCard>
  );
}
