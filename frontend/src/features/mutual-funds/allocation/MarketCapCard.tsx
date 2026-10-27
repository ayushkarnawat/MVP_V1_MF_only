import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { CoverageBanner, fundAgeText } from "../../../components/mf/CoverageBanner";
import { formatPercent as lookthroughPercent, percentageProduct } from "../../../components/mf/lookthroughDisplay";
import { formatCompactRupees, formatDate, formatPercent, formatRupees } from "../../../lib/format";
import { SlicedDonut, useSelectedSlice } from "../common/charts";
import { SectionCard } from "../common/SectionCard";
import type { CapAllocationSummary, StockHoldingRow } from "../types";
import {
  type AnalyticsCardProps,
  capSlices,
  chartPct,
  hasNegative,
  largestSlice,
} from "./allocationLogic";
import { DrillPanel } from "./DrillPanel";

interface StockListProps {
  rows: StockHoldingRow[];
  total: number;
  idPrefix: string;
}

function StockList({ rows, total, idPrefix }: StockListProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--ui-text-muted)]">No holdings in this group</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const isOpen = openIndex === index;
          return (
            <li
              key={`${idPrefix}-${index}-${row.isin ?? row.instrument_name}`}
              data-testid={`${idPrefix}-${index}`}
              className="flex flex-col rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2 text-xs"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                data-clickable=""
                data-effect="expand"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between text-left transition-colors hover:text-[var(--ui-text)]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ChevronRight
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                  <span
                    title={row.instrument_name}
                    className="truncate font-medium text-[var(--ui-text)]"
                  >
                    {row.instrument_name}
                  </span>
                </div>
                <span className="shrink-0 text-[var(--ui-text-muted)] font-medium">
                  {formatRupees(row.exposure_value)}
                </span>
              </button>

              {isOpen && (
                <div className="mt-2 border-t border-[var(--ui-divider)] pt-2 flex flex-col gap-1">
                  {row.sector_raw && (
                    <div className="text-[11px] text-[var(--ui-text-muted)] font-medium">
                      Sector: {row.sector_raw}
                    </div>
                  )}
                  <ul
                    aria-label={`Funds holding ${row.instrument_name}`}
                    className="flex flex-col gap-1"
                  >
                    {row.contributing_funds.map(fund => {
                      const age = fundAgeText(fund);
                      const prod = percentageProduct(
                        fund.fund_weight_pct,
                        fund.stock_weight_pct
                      );
                      return (
                        <li
                          key={fund.scheme_id}
                          data-testid={`${idPrefix}-${index}-fund-${fund.scheme_id}`}
                          className="text-[11px] text-[var(--ui-text-muted)]"
                        >
                          {fund.scheme_name} · {lookthroughPercent(fund.stock_weight_pct)}% of fund ·{" "}
                          {lookthroughPercent(prod)}% of portfolio
                          {age ? ` · ${age}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {total > rows.length && (
        <p className="text-xs text-[var(--ui-text-muted)]">
          Showing the largest {rows.length} of {total} holdings in this group.
        </p>
      )}
    </div>
  );
}

export function MarketCapCard({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<CapAllocationSummary>) {
  const [equityOnly, setEquityOnly] = useState(false);

  const slices = useMemo(() => {
    return data ? capSlices(data, equityOnly) : [];
  }, [data, equityOnly]);

  const { selectedKey, activeKey, select, hover } = useSelectedSlice(slices);

  const largest = useMemo(() => largestSlice(slices), [slices]);
  const containsNegative = useMemo(() => hasNegative(slices), [slices]);

  const selectedSlice = selectedKey ? slices.find(s => s.key === selectedKey) ?? null : null;

  const totalValNum = data ? Number(data.total_portfolio_value) : 0;
  const equityValNum = data ? Number(data.total_equity_value) : 0;

  return (
    <SectionCard
      title="Market-Cap Allocation"
      info="Equity holdings classified by AMFI market-cap size, looked through every fund you own."
      state={state}
      onRetry={onRetry}
    >
      {!data ? (
        <p className="text-xs text-[var(--ui-text-muted)]">
          No market-cap allocation data available
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p data-testid="as-on" className="text-xs text-[var(--ui-text-muted)]">
            Values as on {formatDate(data.nav_as_of)} · Holdings as on {formatDate(data.holdings_as_of)} ·{" "}
            {data.classification_as_of
              ? `AMFI classification effective from ${formatDate(data.classification_as_of)}.`
              : "No applicable AMFI classifications for these holdings."}
          </p>

          <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />

          {/* Allocation denominator toggle */}
          <div
            role="group"
            aria-label="Allocation denominator"
            className="inline-flex self-start rounded-lg border border-[var(--ui-divider)] p-0.5"
          >
            <button
              type="button"
              aria-pressed={!equityOnly}
              data-clickable=""
              data-effect="switch"
              onClick={() => setEquityOnly(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                !equityOnly
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              % of total portfolio
            </button>
            <button
              type="button"
              aria-pressed={equityOnly}
              data-clickable=""
              data-effect="switch"
              onClick={() => setEquityOnly(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                equityOnly
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              % of equity only
            </button>
          </div>

          {equityOnly && equityValNum === 0 ? (
            <p className="text-xs text-[var(--ui-text-muted)]">
              No equity holdings for this selection
            </p>
          ) : !equityOnly && totalValNum === 0 ? (
            <p className="text-xs text-[var(--ui-text-muted)]">
              No holdings for this selection
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-8">
              <SlicedDonut
                slices={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
                selectedKey={selectedKey}
                onSelect={select}
                activeKey={activeKey}
                onActiveChange={hover}
                centre={{
                  label: equityOnly ? "Equity only" : "Total portfolio",
                  value: formatCompactRupees(
                    equityOnly ? data.total_equity_value : data.total_portfolio_value
                  ),
                }}
                ariaLabel="Market-cap allocation chart"
              />

              <ul
                aria-label="Market-cap breakdown"
                className="flex flex-col gap-2 min-w-[200px]"
              >
                {slices.map(slice => {
                  const isSelected = selectedKey === slice.key;
                  return (
                    <li
                      key={slice.key}
                      data-testid={`legend-${slice.key}`}
                      onMouseEnter={() => hover(slice.key)}
                      onMouseLeave={() => hover(null)}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        data-clickable=""
                        data-effect="select"
                        onClick={() => select(slice.key)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg p-2 text-xs transition-colors ${
                          isSelected
                            ? "bg-[var(--ui-row-hover)] font-semibold"
                            : "hover:bg-[var(--ui-row-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: slice.color }}
                            className="h-3 w-3 rounded-full shrink-0"
                          />
                          <span className="text-[var(--ui-text)]">{slice.label}</span>
                        </div>
                        <span className="font-medium text-[var(--ui-text-muted)]">
                          {formatPercent(slice.pct, { digits: 1 })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!data.hide_headlines && largest && (
            <p data-testid="largest-allocation" className="text-xs font-medium text-[var(--ui-text)]">
              Largest allocation: {largest.label} ({formatPercent(largest.pct, { digits: 1 })})
            </p>
          )}

          {containsNegative && (
            <p className="text-xs text-[var(--ui-text-muted)]">
              Negative net positions are listed with their signed percentages; the donut shows positive exposures.
            </p>
          )}

          {/* Drill panel */}
          {selectedSlice && (
            <DrillPanel title={selectedSlice.label} color={selectedSlice.color}>
              {selectedKey === "other" ? (
                <div className="flex flex-col gap-4">
                  {/* Block 1: Not equity */}
                  <div className="flex flex-col gap-2">
                    <h5 className="text-xs font-semibold text-[var(--ui-text)]">
                      Not equity (debt, cash, gold, REITs)
                    </h5>
                    {equityOnly ? (
                      <p className="text-xs text-[var(--ui-text-muted)]">
                        Excluded from the equity-only view
                      </p>
                    ) : (
                      <>
                        <p data-testid="other-non-equity-value" className="text-xs font-medium text-[var(--ui-text)]">
                          {formatRupees(data.other.non_equity_value)}
                        </p>
                        <StockList
                          rows={data.other.non_equity_rows}
                          total={data.other.non_equity_count}
                          idPrefix="non-equity"
                        />
                      </>
                    )}
                  </div>

                  {/* Block 2: Equity not in AMFI list */}
                  <div className="flex flex-col gap-2">
                    <h5 className="text-xs font-semibold text-[var(--ui-text)]">
                      Equity not in AMFI list
                    </h5>
                    <p data-testid="other-unclassified-value" className="text-xs font-medium text-[var(--ui-text)]">
                      {formatRupees(data.other.unclassified_equity_value)}
                    </p>
                    <StockList
                      rows={data.other.unclassified_equity_rows}
                      total={data.other.unclassified_equity_count}
                      idPrefix="unclassified"
                    />
                  </div>
                </div>
              ) : (
                (() => {
                  const bucket = data.buckets.find(
                    b => b.key.toLowerCase() === selectedKey
                  );
                  return bucket ? (
                    <StockList
                      rows={bucket.rows}
                      total={bucket.row_count}
                      idPrefix="stock"
                    />
                  ) : null;
                })()
              )}
            </DrillPanel>
          )}
        </div>
      )}
    </SectionCard>
  );
}
