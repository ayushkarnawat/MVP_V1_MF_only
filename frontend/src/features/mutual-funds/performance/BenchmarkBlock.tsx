import { Activity, BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "../../../components/ui/skeleton";
import { diffDecimalStrings, toPercentString } from "../../../lib/decimal";
import { formatDate } from "../../../lib/format";
import { BarList, ChartTypeToggle } from "../common/charts";
import { InfoMark } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import { changeDirection, formatSignedPercent } from "../mfCopy";
import type {
  BenchmarkIndexKey,
  BenchmarkWindow,
  PortfolioBenchmarkSummary,
} from "../types";
import {
  barPercent,
  buildEntities,
  DEFAULT_INDICES,
  type EntityKey,
  entityLabel,
  fundDifference,
  fundsForWindow,
  INDEX_DEFS,
  indexLabel,
  layoutRaceTrack,
  miniTrack,
  signedXirr,
  WINDOW_DEFS,
  windowUnavailableText,
  windowView,
} from "./benchmarkLogic";

const CHART_OPTIONS = [
  { id: "race" as const, label: "Race Track", icon: Activity },
  { id: "bars" as const, label: "Bar Chart", icon: BarChart3 },
];

export function BenchmarkBlock() {
  const bench = useMfAnalytics("benchmark");
  const funds = useMfAnalytics("benchmark_funds");

  const [tab, setTab] = useState<"portfolio" | "funds">("portfolio");
  const [windowId, setWindowId] = useState<BenchmarkWindow>("SI");
  const [selectedIndices, setSelectedIndices] = useState<BenchmarkIndexKey[]>([
    ...DEFAULT_INDICES,
  ]);
  const [chartType, setChartType] = useState<"race" | "bars">("race");
  const [selectedKey, setSelectedKey] = useState<EntityKey | null>(null);
  const [openFundId, setOpenFundId] = useState<string | null>(null);

  const [showAllFunds, setShowAllFunds] = useState(false);

  const summary: PortfolioBenchmarkSummary | null =
    bench.status === "ready" ? bench.data : null;

  const currentWindow = windowView(summary, windowId);

  // Build entities for the current window and selected indices
  const entities = useMemo(
    () => buildEntities(summary, windowId, selectedIndices),
    [summary, windowId, selectedIndices]
  );

  // If selectedKey is not among current entities, forget it
  if (selectedKey !== null && !entities.some(e => e.key === selectedKey)) {
    setSelectedKey(null);
  }

  const toggleIndex = (key: BenchmarkIndexKey) => {
    setSelectedIndices(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const fundRows = useMemo(
    () => fundsForWindow(funds.data?.funds ?? [], windowId),
    [funds.data?.funds, windowId]
  );

  const activeOpenFundId = fundRows.some(r => r.fund.scheme_id === openFundId)
    ? openFundId
    : null;

  // Selected entity's row for the detail panel
  const selectedEntity = selectedKey !== null ? entities.find(e => e.key === selectedKey) ?? null : null;

  // Sorted entities for BarList
  const sortedEntitiesForBars = useMemo(() => {
    return [...entities].sort((a, b) => {
      if (a.xirr === null && b.xirr === null) return 0;
      if (a.xirr === null) return 1;
      if (b.xirr === null) return -1;
      return Number(b.xirr) - Number(a.xirr);
    });
  }, [entities]);

  const barItems = useMemo(() => {
    return sortedEntitiesForBars.map(e => ({
      key: e.key,
      label: e.label,
      value: e.xirr ?? "0",
      pct: barPercent(e.xirr, entities),
      color: e.key === "portfolio" ? "var(--pos)" : "var(--c2)",
    }));
  }, [sortedEntitiesForBars, entities]);

  const markers = useMemo(() => layoutRaceTrack(entities), [entities]);

  return (
    <section
      data-testid="block-benchmark"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          Benchmark Comparison (XIRR)
        </h3>
        <InfoMark
          text="Your annualised return and each fund's, set against broad market Nifty indices over the window you pick, timed on the same cash flows."
        />
      </div>

      <p className="text-xs text-[var(--ui-text-muted)] mb-4">
        Cash-flow timed performance benchmarking against broad market Nifty indices and scheme benchmarks.
      </p>

      {/* Tabs and Time Windows row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Tab switch */}
        <div
          role="tablist"
          aria-label="Benchmark view"
          className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "portfolio"}
            data-clickable=""
            data-effect="switch"
            onClick={() => setTab("portfolio")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "portfolio"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Portfolio vs Broad Market
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "funds"}
            data-clickable=""
            data-effect="switch"
            onClick={() => setTab("funds")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "funds"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Per-Fund vs Benchmark
          </button>
        </div>

        {/* Window control */}
        <div
          role="group"
          aria-label="Time window"
          className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5"
        >
          {WINDOW_DEFS.map(win => {
            const view = windowView(summary, win.id);
            const isAvailable = summary !== null ? view.available : true;
            const isPressed = windowId === win.id;
            const tooltip = !isAvailable ? windowUnavailableText(view.reason) : undefined;

            return (
              <button
                key={win.id}
                type="button"
                aria-pressed={isPressed}
                aria-disabled={isAvailable ? "false" : "true"}
                title={tooltip}
                data-tooltip={tooltip}
                data-clickable=""
                data-effect="select"
                onClick={() => {
                  if (isAvailable) {
                    setWindowId(win.id);
                  }
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  !isAvailable
                    ? "opacity-40 cursor-not-allowed text-[var(--ui-text-muted)]"
                    : isPressed
                    ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                    : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {win.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      {currentWindow.startDate !== null && (
        <p data-testid="window-start" className="text-xs text-[var(--ui-text-muted)] mb-3">
          Measured from {formatDate(currentWindow.startDate)}
        </p>
      )}

      {summary !== null && (summary.windows ?? []).length === 0 && (
        <p role="note" data-testid="recomputing-note" className="text-xs text-[var(--ui-text-muted)] mb-3">
          Only Since Inception is available right now. The other time windows are being recalculated and will appear after the next refresh.
        </p>
      )}

      {/* Tab 1: Portfolio vs Broad Market */}
      {tab === "portfolio" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Index chips */}
            <div role="group" aria-label="Benchmark indices" className="flex flex-wrap items-center gap-1.5">
              {INDEX_DEFS.map(def => {
                const pressed = selectedIndices.includes(def.key);
                return (
                  <button
                    key={def.key}
                    type="button"
                    aria-pressed={pressed}
                    data-testid={`chip-${def.key}`}
                    data-clickable=""
                    data-effect="select"
                    onClick={() => toggleIndex(def.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      pressed
                        ? "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-elevated)]"
                        : "border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:border-[var(--ui-text)] hover:text-[var(--ui-text)]"
                    }`}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>

            {/* Chart type toggle */}
            <ChartTypeToggle
              label="Chart type"
              value={chartType}
              options={CHART_OPTIONS}
              onChange={setChartType}
            />
          </div>

          {/* Loading state */}
          {bench.status === "loading" && (
            <div role="status" aria-label="Loading benchmark comparison" className="py-8">
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          )}

          {/* Failed / error state */}
          {(bench.status === "failed" || bench.status === "error") && (
            <div role="alert" className="flex flex-col gap-2 py-4">
              <p className="text-sm text-[var(--ui-text-muted)]">
                Couldn't load the benchmark comparison.
              </p>
              <button
                type="button"
                data-clickable=""
                data-effect="retry"
                onClick={bench.retry}
                className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Ready state */}
          {bench.status === "ready" && (
            <>
              {chartType === "race" ? (
                <div className="flex flex-col gap-4">
                  {/* Race track */}
                  <div
                    data-testid="race-track"
                    role="group"
                    aria-label="Benchmark race track"
                    className="relative h-32 w-full rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4"
                  >
                    {/* Track axis line */}
                    <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-[var(--ui-divider)]" />

                    {markers.map(marker => {
                      const entity = entities.find(e => e.key === marker.key);
                      const xirrStr = entity?.xirr ?? null;
                      const label = entity ? entity.label : entityLabel(marker.key);
                      const isSelected = selectedKey === marker.key;

                      return (
                        <button
                          key={marker.key}
                          type="button"
                          data-testid={`marker-${marker.key}`}
                          aria-pressed={isSelected}
                          aria-label={`${label} ${signedXirr(xirrStr)}`}
                          data-clickable=""
                          data-effect="select"
                          data-selected={isSelected}
                          data-x={marker.x}
                          data-offset={marker.offset}
                          data-crown={marker.crown}
                          data-above={marker.above}
                          onClick={() => setSelectedKey(marker.key)}
                          style={{
                            left: `${marker.x}%`,
                            transform: `translate(-50%, calc(-50% + ${marker.offset}px))`,
                          }}
                          className={`absolute top-1/2 flex flex-col items-center group transition-transform ${
                            isSelected ? "z-20" : "z-10"
                          }`}
                        >
                          {marker.above && (
                            <div className="mb-1 flex flex-col items-center text-[10px] font-medium leading-tight">
                              {marker.crown && (
                                <span data-testid="crown" aria-hidden className="text-[var(--warn-text)] text-xs">
                                  ♛
                                </span>
                              )}
                              <span className={isSelected ? "text-[var(--ui-text)] font-semibold" : "text-[var(--ui-text-muted)]"}>
                                {label}
                              </span>
                            </div>
                          )}

                          <div
                            className={`h-4 w-4 rounded-full border-2 transition-transform ${
                              isSelected ? "scale-125 ring-2 ring-[var(--ui-text)]" : ""
                            }`}
                            style={{
                              backgroundColor:
                                marker.key === "portfolio" ? "var(--pos)" : "var(--c2)",
                              borderColor: "var(--ui-card)",
                            }}
                          />

                          {!marker.above && (
                            <div className="mt-1 flex flex-col items-center text-[10px] font-medium leading-tight">
                              {marker.crown && (
                                <span data-testid="crown" aria-hidden className="text-[var(--warn-text)] text-xs">
                                  ♛
                                </span>
                              )}
                              <span className={isSelected ? "text-[var(--ui-text)] font-semibold" : "text-[var(--ui-text-muted)]"}>
                                {label}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Benchmark values list */}
                  <ul
                    aria-label="Benchmark values"
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ui-text-muted)]"
                  >
                    {entities.map(e => (
                      <li key={e.key} data-testid={`value-${e.key}`}>
                        <span className="font-medium text-[var(--ui-text)]">{e.label}</span>
                        <span>: {signedXirr(e.xirr)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                /* Bar chart */
                <BarList
                  ariaLabel="Benchmark bars"
                  items={barItems}
                  selectedKey={selectedKey}
                  onSelect={k => setSelectedKey(k as EntityKey)}
                  formatValue={item => {
                    const ent = entities.find(e => e.key === item.key);
                    return signedXirr(ent?.xirr ?? null);
                  }}
                />
              )}

              {/* Detail panel */}
              {selectedEntity && (
                <div
                  data-testid="benchmark-detail"
                  role="region"
                  aria-label={`${selectedEntity.label} by period`}
                  className="mt-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
                >
                  <h4 className="text-sm font-semibold text-[var(--ui-text)] mb-3">
                    {selectedEntity.label}
                  </h4>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                        <th className="pb-2 font-medium">Period</th>
                        <th className="pb-2 font-medium">XIRR</th>
                        <th className="pb-2 font-medium">You vs this</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ui-divider)]">
                      {WINDOW_DEFS.map(win => {
                        const winV = windowView(summary, win.id);
                        const isWinAvail = winV.available;
                        const entityRate = isWinAvail
                          ? selectedEntity.key === "portfolio"
                            ? winV.portfolio
                            : winV.indices[selectedEntity.key as BenchmarkIndexKey] ?? null
                          : null;

                        const xirrText = !isWinAvail ? "Unavailable" : signedXirr(entityRate);

                        let compText = "—";
                        if (
                          isWinAvail &&
                          selectedEntity.key !== "portfolio" &&
                          winV.portfolio !== null &&
                          entityRate !== null
                        ) {
                          const diff = diffDecimalStrings(
                            toPercentString(winV.portfolio),
                            toPercentString(entityRate)
                          );
                          compText = formatSignedPercent(diff, 1);
                        }

                        return (
                          <tr key={win.id} data-testid={`detail-${win.id}`}>
                            <th scope="row" className="py-2 font-normal text-[var(--ui-text)]">
                              {win.label}
                            </th>
                            <td className="py-2 text-[var(--ui-text)]">{xirrText}</td>
                            <td className="py-2 text-[var(--ui-text-muted)]">{compText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: Per-Fund vs Benchmark */}
      {tab === "funds" && (
        <div className="flex flex-col gap-4">
          {/* Fund summary */}
          <div
            data-testid="fund-summary"
            className="flex flex-wrap items-center gap-6 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs"
          >
            <span>
              Overall Portfolio XIRR:{" "}
              <strong className="font-semibold text-[var(--ui-text)]">
                {signedXirr(
                  currentWindow.portfolio ??
                    (windowId === "SI" ? funds.data?.overall_portfolio_xirr : null)
                )}
              </strong>
            </span>
            <span>
              Broad Market (Nifty 500):{" "}
              <strong className="font-semibold text-[var(--ui-text)]">
                {signedXirr(
                  currentWindow.indices.nifty_500 ??
                    (windowId === "SI" ? funds.data?.overall_broad_market_xirr : null)
                )}
              </strong>
            </span>
          </div>

          {/* Loading fund comparison */}
          {funds.status === "loading" && (
            <div role="status" aria-label="Loading fund comparison" className="py-8">
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          )}

          {/* Failed fund comparison */}
          {(funds.status === "failed" || funds.status === "error") && (
            <div role="alert" className="flex flex-col gap-2 py-4">
              <p className="text-sm text-[var(--ui-text-muted)]">
                Couldn't load the fund comparison.
              </p>
              <button
                type="button"
                data-clickable=""
                data-effect="retry"
                onClick={funds.retry}
                className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Ready fund comparison */}
          {funds.status === "ready" && (
            <>
              {fundRows.length === 0 &&
              windowId !== "SI" &&
              (funds.data?.funds ?? []).every(f => f.windows === undefined || f.windows.length === 0) &&
              (funds.data?.funds ?? []).length > 0 ? (
                <p role="note" data-testid="funds-recomputing-note" className="text-xs text-[var(--ui-text-muted)]">
                  Per-fund figures for this time window are being recalculated and will appear after the next refresh.
                </p>
              ) : fundRows.length === 0 ? (
                <div className="flex flex-col gap-1 py-4 text-xs text-[var(--ui-text-muted)]">
                  <p className="font-medium text-[var(--ui-text)]">
                    No per-fund benchmark comparison available
                  </p>
                  <p>
                    Import holdings with transaction history to evaluate individual scheme returns against assigned Nifty benchmarks.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <ul aria-label="Funds against their benchmarks" className="flex flex-col gap-2">
                    {(showAllFunds ? fundRows : fundRows.slice(0, 5)).map(({ fund, view }) => {
                      const isOpen = activeOpenFundId === fund.scheme_id;
                      const track = miniTrack(view);
                      const diff = fundDifference(view);
                      const dir = changeDirection(diff);
                      const dirColorClass =
                        dir === "up"
                          ? "text-[var(--pos-text)]"
                          : dir === "down"
                          ? "text-[var(--neg-text)]"
                          : "text-[var(--ui-text-muted)]";

                      return (
                        <li
                          key={fund.scheme_id}
                          data-testid={`fund-row-${fund.scheme_id}`}
                          className="flex flex-col rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)]"
                        >
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            data-testid={`fund-toggle-${fund.scheme_id}`}
                            data-clickable=""
                            data-effect="expand"
                            onClick={() =>
                              setOpenFundId(isOpen ? null : fund.scheme_id)
                            }
                            className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-[var(--ui-row-hover)]"
                          >
                            <span
                              title={fund.scheme_name}
                              className="w-1/3 truncate text-xs font-medium text-[var(--ui-text)]"
                            >
                              {fund.scheme_name}
                            </span>

                            {track !== null && (
                              <div
                                aria-hidden="true"
                                className="relative mx-4 h-1.5 flex-1 rounded-full bg-[var(--ui-divider)]"
                              >
                                <span
                                  data-testid={`mini-fund-${fund.scheme_id}`}
                                  data-x={track.fund}
                                  style={{ left: `${track.fund}%` }}
                                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--pos)]"
                                />
                                <span
                                  data-testid={`mini-bench-${fund.scheme_id}`}
                                  data-x={track.benchmark}
                                  style={{ left: `${track.benchmark}%` }}
                                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--c2)]"
                                />
                              </div>
                            )}

                            <span
                              data-testid={`fund-diff-${fund.scheme_id}`}
                              className={`text-xs font-semibold ${dirColorClass}`}
                            >
                              {formatSignedPercent(diff, 1)} vs Benchmark
                            </span>
                          </button>

                          {isOpen && (
                            <div
                              data-testid={`fund-detail-${fund.scheme_id}`}
                              className="border-t border-[var(--ui-divider)] p-3 text-xs flex flex-wrap items-center gap-4 text-[var(--ui-text-muted)]"
                            >
                              <span>
                                Benchmark: {indexLabel(fund.benchmark_index)} (Total Return)
                              </span>
                              <span>
                                Fund XIRR{" "}
                                <span
                                  data-testid={`fund-xirr-${fund.scheme_id}`}
                                  className="font-medium text-[var(--ui-text)]"
                                >
                                  {signedXirr(view.fund)}
                                </span>
                              </span>
                              <span>
                                Benchmark{" "}
                                <span
                                  data-testid={`bench-xirr-${fund.scheme_id}`}
                                  className="font-medium text-[var(--ui-text)]"
                                >
                                  {signedXirr(view.benchmark)}
                                </span>
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {fundRows.length > 5 && (
                    <button
                      type="button"
                      aria-expanded={showAllFunds}
                      data-clickable=""
                      data-effect="expand"
                      onClick={() => setShowAllFunds(prev => !prev)}
                      className="self-center py-1 text-xs font-medium text-[var(--pos-text)] hover:underline"
                    >
                      {showAllFunds
                        ? "Show Less"
                        : `Show More (${fundRows.length - 5} remaining)`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
