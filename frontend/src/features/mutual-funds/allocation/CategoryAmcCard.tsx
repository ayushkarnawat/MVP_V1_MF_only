import { BarChart3, PieChart } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatCompactRupees, formatPercent, formatRupees } from "../../../lib/format";
import { BarList, ChartTypeToggle, SlicedDonut, useSelectedSlice } from "../common/charts";
import { SectionCard } from "../common/SectionCard";
import type {
  AnalyticsAllocationSummary,
  HoldingRow,
  Load,
} from "../types";
import {
  type AnalyticsCardProps,
  bucketSlices,
  chartPct,
  fundsInSlice,
  type SortOrder,
} from "./allocationLogic";
import { DrillPanel } from "./DrillPanel";

const CHART_OPTIONS = [
  { id: "donut" as const, label: "Donut", icon: PieChart },
  { id: "bar" as const, label: "Bar Chart", icon: BarChart3 },
];

export interface CategoryAmcCardProps extends AnalyticsCardProps<AnalyticsAllocationSummary> {
  holdings: Load<HoldingRow[]>;
}

export function CategoryAmcCard({
  state,
  data,
  onRetry,
  holdings,
}: CategoryAmcCardProps) {
  const [tab, setTab] = useState<"category" | "amc">("category");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [chartType, setChartType] = useState<"donut" | "bar">("donut");

  const rawItems = useMemo(() => {
    if (!data) return [];
    return tab === "category" ? data.by_category : data.by_amc;
  }, [data, tab]);

  const slices = useMemo(() => {
    return bucketSlices(rawItems, order);
  }, [rawItems, order]);

  const { selectedKey, activeKey, select, clear, hover } = useSelectedSlice(slices);

  const selectedSlice = selectedKey
    ? slices.find(s => s.key === selectedKey) ?? null
    : null;

  const handleTabChange = (nextTab: "category" | "amc") => {
    if (nextTab !== tab) {
      setTab(nextTab);
      clear();
    }
  };

  const ariaLabel = tab === "category" ? "Category breakdown" : "AMC breakdown";
  const chartAriaLabel = tab === "category" ? "SEBI category chart" : "Fund house chart";

  return (
    <SectionCard
      title="Portfolio Allocation"
      info="Asset distribution across SEBI categories and fund houses (AMCs)."
      state={state}
      onRetry={onRetry}
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--ui-text-muted)]">
          Asset distribution across SEBI categories and fund houses.
        </p>

        {/* Tab switch and chart type toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Breakdown"
            className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "category"}
              data-clickable=""
              data-effect="switch"
              onClick={() => handleTabChange("category")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === "category"
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              By Category
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "amc"}
              data-clickable=""
              data-effect="switch"
              onClick={() => handleTabChange("amc")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === "amc"
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              By AMC
            </button>
          </div>

          <ChartTypeToggle
            label="Chart type"
            value={chartType}
            options={CHART_OPTIONS}
            onChange={setChartType}
          />
        </div>

        {slices.length === 0 ? (
          <div className="flex flex-col gap-1 py-4 text-xs text-[var(--ui-text-muted)]">
            <p className="font-medium text-[var(--ui-text)]">
              No allocation data available for this selection
            </p>
            <p>
              Import a CAS statement with valid mutual fund holdings to visualize category and AMC breakdown.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Sort order group */}
            <div
              role="group"
              aria-label="Sort order"
              className="inline-flex self-start rounded-lg border border-[var(--ui-divider)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={order === "asc"}
                data-clickable=""
                data-effect="sort"
                onClick={() => setOrder("asc")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  order === "asc"
                    ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                    : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                Smallest first
              </button>
              <button
                type="button"
                aria-pressed={order === "desc"}
                data-clickable=""
                data-effect="sort"
                onClick={() => setOrder("desc")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  order === "desc"
                    ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                    : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                Largest first
              </button>
            </div>

            {chartType === "donut" ? (
              <div className="flex flex-wrap items-center gap-8">
                <SlicedDonut
                  slices={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
                  selectedKey={selectedKey}
                  onSelect={select}
                  activeKey={activeKey}
                  onActiveChange={hover}
                  centre={{
                    label: "Total",
                    value: formatCompactRupees(data?.total_value ?? "0"),
                  }}
                  ariaLabel={chartAriaLabel}
                />

                <ul aria-label={ariaLabel} className="flex flex-col gap-2 min-w-[200px]">
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
            ) : (
              <BarList
                items={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
                selectedKey={selectedKey}
                onSelect={select}
                formatValue={item => {
                  const sl = slices.find(s => s.key === item.key);
                  return formatPercent(sl?.pct ?? item.pct, { digits: 1 });
                }}
                ariaLabel={ariaLabel}
              />
            )}

            {/* Drill panel */}
            {selectedSlice && (
              <DrillPanel
                title={`${selectedSlice.label} — contributing funds`}
                color={selectedSlice.color}
              >
                {holdings.status === "loading" && (
                  <div role="status" aria-label="Loading funds" className="py-4">
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                )}

                {holdings.status === "error" && (
                  <div role="alert" className="flex flex-col gap-2 py-2">
                    <p className="text-xs text-[var(--ui-text-muted)]">
                      The funds in this slice couldn't be loaded.
                    </p>
                    <button
                      type="button"
                      data-clickable=""
                      data-effect="retry"
                      onClick={holdings.retry}
                      className="self-start text-xs font-medium text-[var(--pos-text)] hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {holdings.status === "data" &&
                  (() => {
                    const { funds, count } = fundsInSlice(
                      tab,
                      selectedSlice.label,
                      holdings.data ?? [],
                      selectedSlice.value
                    );

                    if (funds.length === 0) {
                      return (
                        <p className="text-xs text-[var(--ui-text-muted)]">
                          No priced funds in this slice.
                        </p>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-2">
                        <ul aria-label="Contributing funds" className="flex flex-col gap-2">
                          {funds.slice(0, 5).map(fund => (
                            <li
                                key={fund.schemeId}
                                data-testid={`drill-fund-${fund.schemeId}`}
                                data-largest={fund.largest ? "true" : "false"}
                                className="flex flex-col gap-1 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2.5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      title={fund.name}
                                      className="truncate font-medium text-[var(--ui-text)]"
                                    >
                                      {fund.name}
                                    </span>
                                    {fund.largest && (
                                      <span className="rounded bg-[var(--ui-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pos-text)] border border-[var(--ui-divider)]">
                                        Largest
                                      </span>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-medium text-[var(--ui-text)]">
                                    {formatRupees(fund.value)} ·{" "}
                                    {formatPercent(fund.share, { digits: 1 })}
                                  </span>
                                </div>

                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
                                  <span
                                    data-testid={`drill-bar-${fund.schemeId}`}
                                    style={{
                                      width: `${fund.share}%`,
                                      backgroundColor: selectedSlice.color,
                                    }}
                                    className="block h-full rounded-full"
                                  />
                                </div>
                              </li>
                            ))}
                        </ul>

                        <p data-testid="drill-caption" className="text-xs text-[var(--ui-text-muted)]">
                          Largest {Math.min(5, count)} of {count}{" "}
                          {count === 1 ? "fund" : "funds"} in this slice.
                        </p>
                      </div>
                    );
                  })()}
              </DrillPanel>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
