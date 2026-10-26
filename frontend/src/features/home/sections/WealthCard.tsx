import { useEffect, useState } from "react";
import { Calendar, Info } from "lucide-react";
import { LineAreaChart } from "@/components/ui/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { BenchmarkSelect } from "../components/BenchmarkSelect";
import { ChangeBadge } from "../components/ChangeBadge";
import { DateRangeCalendar, type DateRange } from "../components/DateRangeCalendar";
import { HideValuesButton } from "../components/HideValuesButton";
import { PartialDataBadge } from "../components/PartialDataBadge";
import { PeriodSelector } from "../components/PeriodSelector";
import { periodLabel, periodNote, wealthCaption } from "../homeCopy";
import {
  formatCompactRupees,
  formatDate,
  formatDayMonth,
  formatRupees,
  formatSignedPercent,
} from "../homeFormat";
import type {
  BenchmarkOptionOut,
  HomePeriod,
  WealthSeriesResponse,
} from "../types";

export interface WealthCardProps {
  status: "loading" | "error" | "data";
  data: WealthSeriesResponse | null;
  scope: "aggregate" | "member";
  memberName?: string | null;
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
  today: string;
  benchmarkOptions: BenchmarkOptionOut[];
  benchmark: string | null;
  onBenchmarkChange: (index: string) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onRetry: () => void;
  onImport: () => void;
  onInfo?: () => void;
}

export function WealthCard({
  status,
  data,
  scope,
  memberName,
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  today,
  benchmarkOptions,
  benchmark,
  onBenchmarkChange,
  hidden,
  onToggleHidden,
  onRetry,
  onImport,
  onInfo,
}: WealthCardProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (period !== "custom") {
      setCalendarOpen(false);
    }
  }, [period]);

  const captionText = wealthCaption(scope, memberName);

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
        <div role="status" aria-label="Loading wealth graph" className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
        <div className="flex items-center justify-between">
          <span
            data-testid="wealth-caption"
            className="text-sm font-medium text-[var(--ui-text-muted)]"
          >
            {captionText}
          </span>
        </div>
        <p className="mt-4 text-sm text-[var(--ui-text-muted)]">
          Could not load your wealth graph.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          Try again
        </button>
      </div>
    );
  }

  const rangeText =
    customRange.from && customRange.to
      ? `${formatDayMonth(customRange.from)} – ${formatDayMonth(customRange.to)}`
      : null;

  const handlePeriodChange = (chosen: HomePeriod) => {
    onPeriodChange(chosen);
    if (chosen === "custom") {
      setCalendarOpen(true);
    }
  };

  if (data.empty) {
    if (period === "custom") {
      return (
        <div className="relative rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                data-testid="wealth-caption"
                className="text-sm font-medium text-[var(--ui-text-muted)]"
              >
                {captionText}
              </span>
              {onInfo && (
                <button
                  type="button"
                  aria-label="How is this calculated?"
                  onClick={onInfo}
                  className="rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
                >
                  <Info size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <p className="my-6 text-sm text-[var(--ui-text-muted)]">
            No investments in this range.
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--ui-divider)]">
            <PeriodSelector
              value={period}
              onChange={handlePeriodChange}
              customLabel={rangeText ?? undefined}
            />
            <button
              type="button"
              aria-label="Choose dates"
              onClick={() => setCalendarOpen(prev => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <Calendar size={14} className="text-[var(--ui-text-muted)]" aria-hidden="true" />
              <span>{rangeText ?? "Choose dates"}</span>
            </button>
          </div>

          {calendarOpen && (
            <div className="absolute right-4 bottom-14 z-20 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] shadow-lg">
              <DateRangeCalendar
                today={today}
                value={customRange}
                onChange={range => {
                  onCustomRangeChange(range);
                  if (range.from && range.to) {
                    setCalendarOpen(false);
                  }
                }}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              data-testid="wealth-caption"
              className="text-sm font-medium text-[var(--ui-text-muted)]"
            >
              {captionText}
            </span>
            {onInfo && (
              <button
                type="button"
                aria-label="How is this calculated?"
                onClick={onInfo}
                className="rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
              >
                <Info size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-sm text-[var(--ui-text-muted)]">
          No investments yet.
        </p>

        <button
          type="button"
          onClick={onImport}
          className="mt-3 inline-flex items-center rounded-lg bg-[var(--ui-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          Import statement
        </button>
      </div>
    );
  }

  const showBenchmarkLine = Boolean(
    data.benchmark &&
    data.benchmark.available &&
    data.benchmark.pct != null
  );

  const hasSecondSeries = Boolean(
    data.benchmark &&
    data.benchmark.available &&
    !data.benchmark.clipped &&
    data.benchmark.points.length === data.points.length
  );

  const secondSeries =
    hasSecondSeries && data.benchmark
      ? {
          name: data.benchmark.label,
          color: "var(--home-bench)",
          values: data.benchmark.points.map(point => Number(point.pct)),
        }
      : undefined;

  const notes: string[] = [];
  const pNote = periodNote(period, data);
  if (pNote) {
    notes.push(pNote);
  }
  if (data.benchmark) {
    if (!data.benchmark.available) {
      notes.push("Benchmark data is not available for this period.");
    } else if (data.benchmark.clipped && data.benchmark.effective_start) {
      notes.push(
        `Benchmark history starts on ${formatDate(data.benchmark.effective_start)}.`,
      );
    }
  }
  const noteText = notes.join(" ");

  return (
    <div className="relative rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4">
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            data-testid="wealth-caption"
            className="text-sm font-medium text-[var(--ui-text-muted)]"
          >
            {captionText}
          </span>
          {onInfo && (
            <button
              type="button"
              aria-label="How is this calculated?"
              onClick={onInfo}
              className="rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <Info size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data.partial && <PartialDataBadge missingFunds={data.missing_funds} />}
          <BenchmarkSelect
            options={benchmarkOptions}
            value={benchmark}
            onChange={onBenchmarkChange}
          />
        </div>
      </div>

      {/* Headline row */}
      <div className="flex items-baseline gap-3">
        <span
          data-testid="wealth-total"
          className="text-3xl font-bold tracking-tight text-[var(--ui-text)] tabular-nums"
        >
          {hidden ? "••••••" : formatRupees(data.end_value)}
        </span>
        <HideValuesButton hidden={hidden} onToggle={onToggleHidden} />
      </div>

      {/* Change row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ChangeBadge
          amount={data.change_amount}
          pct={data.change_pct}
          hidden={hidden}
        />
        <span className="text-[var(--ui-text-muted)]">
          {`Portfolio change ${periodLabel(period)}`}
        </span>
      </div>

      {/* Benchmark line */}
      {showBenchmarkLine && data.benchmark && (
        <div
          data-testid="benchmark-line"
          className="text-xs font-medium text-[var(--home-bench)]"
        >
          {`${data.benchmark.label} ${formatSignedPercent(data.benchmark.pct)}`}
          {data.benchmark.clipped && data.benchmark.effective_start
            ? ` since ${formatDayMonth(data.benchmark.effective_start)}`
            : ""}
        </div>
      )}

      {/* Chart */}
      <div className="pt-2">
        <LineAreaChart
          series={[
            {
              key: "value",
              name: "Portfolio",
              color: "var(--c1)",
              values: data.points.map(point => Number(point.value)),
              area: true,
            },
          ]}
          {...(secondSeries ? { secondSeries } : {})}
          labels={index => formatDayMonth(data.points[index].date)}
          tooltipLabel={index => formatDate(data.points[index].date)}
          formatValue={
            hidden
              ? () => "••••••"
              : value => formatCompactRupees(String(Math.round(value)))
          }
          formatPercent={value => formatSignedPercent(String(value), 1)}
          ariaLabel="Portfolio value over time"
        />
      </div>

      {/* Note */}
      <p data-testid="wealth-note" className="text-xs text-[var(--ui-text-muted)]">
        {noteText}
      </p>

      {/* Controls row */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--ui-divider)]">
        <PeriodSelector
          value={period}
          onChange={handlePeriodChange}
          customLabel={rangeText ?? undefined}
        />

        {period === "custom" ? (
          <button
            type="button"
            aria-label="Choose dates"
            onClick={() => setCalendarOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Calendar size={14} className="text-[var(--ui-text-muted)]" aria-hidden="true" />
            <span>{rangeText ?? "Choose dates"}</span>
          </button>
        ) : (
          <span className="text-xs text-[var(--ui-text-muted)]">
            Change excludes new money
          </span>
        )}
      </div>

      {/* Calendar popover */}
      {calendarOpen && (
        <div className="absolute right-4 bottom-14 z-20 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] shadow-lg">
          <DateRangeCalendar
            today={today}
            value={customRange}
            onChange={range => {
              onCustomRangeChange(range);
              if (range.from && range.to) {
                setCalendarOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
