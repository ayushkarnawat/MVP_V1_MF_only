import { benchmarkChoiceDetails, benchmarkDisplayName, benchmarkKeyName, BENCHMARK_PERIOD_METHOD } from "@/lib/benchmarkDisplay";
import { BenchmarkInfoNote } from "@/components/BenchmarkInfoNote";
import { SchemeLogo } from "@/components/SchemeLogo";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { LineAreaChart } from "@/components/ui/charts";
import { fundPageApi } from "../api";
import { useFundSection } from "../useFundSection";
import { SectionState } from "../components/SectionState";
import { Segmented } from "../components/Segmented";
import {
  DEFAULT_PERIOD,
  PERFORMANCE_PERIODS,
  SINCE_LAUNCH_NOTE,
  benchmarkNote,
} from "../fundCopy";
import {
  alignToDates,
  axisLabel,
  changeDirection,
  formatDate,
  formatSignedPercent,
  lastPct,
  seriesValues,
  shortCategory,
} from "../fundFormat";
import type {
  CategorySeriesResponse,
  PerformancePeriod,
  PerformanceResponse,
} from "../types";

export interface PerformanceChartProps {
  schemeId: string;
  fundName: string;
  /** Drawn above the period buttons (the Model Portfolio Returns | Actual XIRR toggle). */
  toggleSlot?: ReactNode;
}

export function PerformanceChart({ schemeId, fundName, toggleSlot }: PerformanceChartProps) {
  const [period, setPeriod] = useState<PerformancePeriod>(DEFAULT_PERIOD);
  const [hidden, setHidden] = useState<Record<"fund" | "benchmark" | "category", boolean>>({
    fund: false,
    benchmark: false,
    category: false,
  });

  const perf = useFundSection<PerformanceResponse>(
    (signal) => fundPageApi.performance(schemeId, period, signal),
    [schemeId, period]
  );

  const category = useFundSection<CategorySeriesResponse>(
    (signal) => fundPageApi.categorySeries(schemeId, period, signal),
    [schemeId, period]
  );

  const lastReadyRef = useRef<{ schemeId: string; data: PerformanceResponse } | null>(null);
  if (perf.status === "ready" && perf.data) {
    lastReadyRef.current = { schemeId, data: perf.data };
  }

  const shown: PerformanceResponse | null =
    perf.status === "ready" && perf.data
      ? perf.data
      : perf.status === "loading" && lastReadyRef.current?.schemeId === schemeId
        ? lastReadyRef.current.data
        : null;

  const sectionStatus = shown ? "ready" : perf.status;

  const toggleHidden = (key: "fund" | "benchmark" | "category") => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const periodOptions = PERFORMANCE_PERIODS.map((p) => ({
    value: p,
    label: shown?.benchmark_source != null && shown.period === p ? `${p} · ${formatDate(shown.start)}` : p,
  }));

  const renderBody = (data: PerformanceResponse) => {
    const isCategoryReady = category.status === "ready" && category.data !== null;
    const categoryReady = isCategoryReady ? category.data : null;
    const categoryName = categoryReady
      ? `${shortCategory(categoryReady.category)} category average`
      : "Category average";

    const fundDir = changeDirection(data.period_returns.fund);
    const fundDirColor =
      fundDir === "up"
        ? "text-[var(--pos-text)]"
        : fundDir === "down"
          ? "text-[var(--neg-text)]"
          : "text-[var(--ui-text)]";

    const benchDir = changeDirection(data.period_returns.benchmark);
    const benchDirColor =
      benchDir === "up"
        ? "text-[var(--pos-text)]"
        : benchDir === "down"
          ? "text-[var(--neg-text)]"
          : "text-[var(--ui-text)]";

    const chartSeries = [
      {
        key: "fund",
        name: fundName,
        color: "var(--c2)",
        values: seriesValues(data.fund),
        area: true,
        visible: !hidden.fund,
      },
      ...(data.benchmark !== null
        ? [
            {
              key: "benchmark",
              name: data.benchmark_label ?? "Benchmark",
              color: "var(--c3)",
              values: seriesValues(data.benchmark),
              visible: !hidden.benchmark,
            },
          ]
        : []),
      ...(categoryReady !== null
        ? [
            {
              key: "category",
              name: categoryName,
              color: "var(--ui-text-muted)",
              values: alignToDates(categoryReady.points, data.fund.map((point) => point.date)),
              visible: !hidden.category,
            },
          ]
        : []),
    ];

    const sinceLaunchNoteText = data.since_launch ? SINCE_LAUNCH_NOTE : null;
    const benchmarkNoteText =
      data.benchmark === null ? benchmarkNote(data.benchmark_reason) : null;

    return (
      <div className="space-y-4">
        {data.benchmark_source != null && (
          <div data-testid="benchmark-details" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-hover)] px-4 py-3 text-xs text-[var(--ui-text-muted)] space-y-1.5">
            {data.benchmark_source !== "none" && (
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                <span>Benchmark: <span className="text-[13px] font-semibold text-[var(--ui-text)]">{benchmarkDisplayName(data.benchmark_label ?? (data.benchmark_index ? benchmarkKeyName(data.benchmark_index) : "No benchmark"))}</span></span>
                <BenchmarkInfoNote note={data.benchmark_note} />
                {data.declared_benchmark_name ? (
                  <>
                    <span className="text-[var(--ui-text-muted)]">·</span>
                    <span>Factsheet names: {benchmarkDisplayName(data.declared_benchmark_name)}</span>
                  </>
                ) : null}
              </div>
            )}
            <p className="leading-relaxed max-w-[75ch]">
              {benchmarkChoiceDetails(data.benchmark_source).fullLine} {BENCHMARK_PERIOD_METHOD}
              {data.benchmark_source === "none" && (
                /* This chart draws no printed returns, so a fund with no benchmark gets the plain "No benchmark" reason
                   here even when its factsheet names an index (the returns table shows that case). With no
                   "Benchmark:" line for "none", the note's icon sits beside this sentence instead. */
                <>
                  {" "}
                  <BenchmarkInfoNote note={data.benchmark_note} />
                </>
              )}
            </p>
          </div>
        )}
        <ul aria-label="Chart legend" className="flex flex-wrap items-center gap-2 text-xs">
          {/* Fund legend item */}
          <li>
            <button
              type="button"
              aria-pressed={!hidden.fund}
              data-testid="legend-fund"
              onClick={() => toggleHidden("fund")}
              className={`inline-flex items-center gap-2 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3 py-1.5 transition-opacity ${
                hidden.fund ? "opacity-50" : ""
              }`}
            >
              <i
                aria-hidden="true"
                style={{ background: "var(--c2)" }}
                className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
              />
              <SchemeLogo schemeName={fundName} size="sm" />
              <span className="max-w-[16rem] truncate text-xs text-[var(--ui-text)]" title={fundName}>
                {fundName}
              </span>
              <b data-testid="legend-fund-figure" className={`text-xs font-semibold ${fundDirColor}`}>
                {formatSignedPercent(data.period_returns.fund, 1)}
              </b>
            </button>
          </li>

          {/* Benchmark legend item */}
          {data.benchmark !== null && (() => {
            const benchName = data.benchmark_source != null ? benchmarkDisplayName(data.benchmark_label ?? "Benchmark") : data.benchmark_label ?? "Benchmark";
            return (
              <li>
                <button
                  type="button"
                  aria-pressed={!hidden.benchmark}
                  data-testid="legend-benchmark"
                  onClick={() => toggleHidden("benchmark")}
                  className={`inline-flex items-center gap-2 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3 py-1.5 transition-opacity ${
                    hidden.benchmark ? "opacity-50" : ""
                  }`}
                >
                  <i
                    aria-hidden="true"
                    style={{ background: "var(--c3)" }}
                    className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                  />
                  <span className="max-w-[16rem] truncate text-xs text-[var(--ui-text)]" title={benchName}>
                    {benchName}
                  </span>
                  <b data-testid="legend-benchmark-figure" className={`text-xs font-semibold ${benchDirColor}`}>
                    {formatSignedPercent(data.period_returns.benchmark, 1)}
                  </b>
                </button>
              </li>
            );
          })()}

          {/* Category legend item */}
          {category.status !== "unavailable" && (
            <li>
              <button
                type="button"
                aria-pressed={!hidden.category}
                data-testid="legend-category"
                onClick={() => toggleHidden("category")}
                {...(category.status === "error"
                  ? { title: "Category figures could not be loaded" }
                  : {})}
                className={`inline-flex items-center gap-2 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3 py-1.5 transition-opacity ${
                  hidden.category ? "opacity-50" : ""
                }`}
              >
                <i
                  aria-hidden="true"
                  style={{ background: "var(--ui-text-muted)" }}
                  className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                />
                <span className="max-w-[16rem] truncate text-xs text-[var(--ui-text)]" title={categoryName}>
                  {categoryName}
                </span>
                {category.status === "loading" ? (
                  <b
                    data-testid="legend-category-figure"
                    aria-busy="true"
                    className="text-xs font-semibold text-[var(--ui-text)]"
                  >
                    …
                  </b>
                ) : category.status === "error" ? (
                  <b
                    data-testid="legend-category-figure"
                    className="text-xs font-semibold text-[var(--ui-text)]"
                  >
                    —
                  </b>
                ) : categoryReady ? (
                  (() => {
                    const pctVal = lastPct(categoryReady.points);
                    const catDir = changeDirection(pctVal);
                    const catDirColor =
                      catDir === "up"
                        ? "text-[var(--pos-text)]"
                        : catDir === "down"
                          ? "text-[var(--neg-text)]"
                          : "text-[var(--ui-text)]";
                    return (
                      <b
                        data-testid="legend-category-figure"
                        className={`text-xs font-semibold ${catDirColor}`}
                      >
                        {formatSignedPercent(pctVal, 1)}
                      </b>
                    );
                  })()
                ) : null}
              </button>
            </li>
          )}
        </ul>

        <div
          data-testid="chart-wrap"
          {...(perf.status === "loading" ? { "aria-busy": "true" } : {})}
        >
          <LineAreaChart
            series={chartSeries}
            labels={(index) => axisLabel(data.fund[index]?.date ?? "", period)}
            tooltipLabel={(index) => formatDate(data.fund[index]?.date)}
            formatValue={(value) => formatSignedPercent(String(value), 1)}
            ariaLabel={`Performance chart for ${period}`}
            height={250}
          />
        </div>

        {(sinceLaunchNoteText || benchmarkNoteText) && (
          <div className="space-y-1">
            {sinceLaunchNoteText && (
              <p
                data-testid="perf-note"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {sinceLaunchNoteText}
              </p>
            )}
            {benchmarkNoteText && (
              <p
                data-testid="perf-note"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {benchmarkNoteText}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="perf-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4"
    >
      {toggleSlot ? <div data-testid="perf-toggle-slot">{toggleSlot}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="perf-title" className="text-base font-semibold text-[var(--ui-text)]">
          Performance
        </h3>
        <Segmented
          label="Performance period"
          options={periodOptions}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <SectionState
        status={sectionStatus}
        label="performance"
        reason={perf.reason}
        onRetry={perf.retry}
      >
        {shown ? renderBody(shown) : null}
      </SectionState>
    </section>
  );
}
