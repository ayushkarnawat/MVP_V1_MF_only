import { type ReactNode, useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { LineAreaChart } from "@/components/ui/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactRupees, formatDate, formatPercent } from "@/lib/format";
import { benchmarkColor } from "./benchmarkColors";
import type {
  WealthBenchmarkOption,
  WealthDateRange,
  WealthPeriod,
  WealthSeriesData,
  WealthSeriesStatus,
} from "./types";

export interface WealthGraphProps {
  status?: WealthSeriesStatus;
  data: WealthSeriesData | null;
  period: WealthPeriod;
  onPeriodChange: (period: WealthPeriod) => void;
  customRange: WealthDateRange;
  onCustomRangeChange: (range: WealthDateRange) => void;
  today: string;
  benchmarkOptions: readonly WealthBenchmarkOption[];
  benchmark: string | null;
  onBenchmarkChange: (index: string) => void;
  hideValues?: boolean;
  refreshing?: boolean;
  onRetry?: () => void;
  onImport?: () => void;
  headerLeft?: ReactNode;
  headerRightExtra?: ReactNode;
  headline?: ReactNode;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PERIODS: { value: WealthPeriod; defaultLabel: string }[] = [
  { value: "1D", defaultLabel: "1D" },
  { value: "1W", defaultLabel: "1W" },
  { value: "1M", defaultLabel: "1M" },
  { value: "1Y", defaultLabel: "1Y" },
  { value: "custom", defaultLabel: "Custom" },
];

function formatSignedPercent(value: string | null | undefined, digits = 2): string {
  return formatPercent(value, { digits, signed: true });
}

function formatDayMonth(iso: string | null | undefined): string {
  const text = formatDate(iso);
  if (text === "—") return "—";
  const parts = text.split(" ");
  if (parts.length < 2) return "—";
  return `${parts[0]} ${parts[1]}`;
}

function periodNote(period: WealthPeriod, data: WealthSeriesData | null): string {
  if (period === "1D" && data && data.points && data.points.length >= 2) {
    const first = data.points[0];
    const last = data.points[data.points.length - 1];
    return `1D compares two NAV days (${formatDayMonth(first.date)} and ${formatDayMonth(last.date)}). Mutual fund NAVs publish once a day, so there is no intraday line.`;
  }
  return "";
}

function daysInMonth(year: number, month: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2) return isLeap ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function isoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minSelectableDate(today: string, years = 10): string {
  const [yStr, mStr, dStr] = today.split("-");
  const targetYear = Number(yStr) - years;
  const month = Number(mStr);
  const targetDay = Math.min(Number(dStr), daysInMonth(targetYear, month));
  return isoDate(targetYear, month, targetDay);
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}

function leadingBlanks(year: number, month: number): number {
  const dayOfWeekUtc = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (dayOfWeekUtc + 6) % 7;
}

function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function getRangeAttr(
  iso: string,
  from: string | null,
  to: string | null,
): "single" | "start" | "end" | "middle" | undefined {
  if (!from) return undefined;
  if (to !== null && from === to && iso === from) return "single";
  if (iso === from && (to === null || to !== from)) return "start";
  if (to !== null && iso === to && from !== to) return "end";
  if (to !== null && iso > from && iso < to) return "middle";
  return undefined;
}

function isAriaPressed(iso: string, from: string | null, to: string | null): boolean {
  if (!from) return false;
  const end = to ?? from;
  return iso >= from && iso <= end;
}

function GraphBenchmarkSelect({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly WealthBenchmarkOption[];
  value: string | null;
  onChange: (index: string) => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || options.length === 0;

  return (
    <select
      aria-label="Benchmark"
      value={value ?? ""}
      disabled={isDisabled}
      onChange={e => onChange(e.target.value)}
      className="rounded-md border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2 py-1 text-sm text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-text)]"
    >
      {options.map(option => (
        <option key={option.index} value={option.index}>
          {option.recommended ? `${option.label} (recommended)` : option.label}
        </option>
      ))}
    </select>
  );
}

function GraphPeriodSelector({
  value,
  onChange,
  customLabel,
  disabled = false,
}: {
  value: WealthPeriod;
  onChange: (period: WealthPeriod) => void;
  customLabel?: string;
  disabled?: boolean;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = (idx + 1) % PERIODS.length;
      buttonRefs.current[nextIdx]?.focus();
      onChange(PERIODS[nextIdx].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = (idx - 1 + PERIODS.length) % PERIODS.length;
      buttonRefs.current[prevIdx]?.focus();
      onChange(PERIODS[prevIdx].value);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Period"
      className="inline-flex items-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] p-0.5"
    >
      {PERIODS.map((p, idx) => {
        const isChecked = p.value === value;
        const label = p.value === "custom" && customLabel ? customLabel : p.defaultLabel;

        return (
          <button
            key={p.value}
            ref={el => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isChecked ? "true" : "false"}
            tabIndex={isChecked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            onKeyDown={e => handleKeyDown(e, idx)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] ${
              isChecked
                ? "bg-[var(--ui-elevated)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function GraphDateRangeCalendar({
  today,
  value,
  onChange,
  maxYears = 10,
}: {
  today: string;
  value: WealthDateRange;
  onChange: (range: WealthDateRange) => void;
  maxYears?: number;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = value.to ?? value.from ?? today;
    const parts = initialDate.split("-");
    return {
      year: Number(parts[0]),
      month: Number(parts[1]),
    };
  });

  const { year, month } = visibleMonth;
  const minDate = minSelectableDate(today, maxYears);

  const minYear = Number(minDate.split("-")[0]);
  const minMonth = Number(minDate.split("-")[1]);
  const todayYear = Number(today.split("-")[0]);
  const todayMonth = Number(today.split("-")[1]);

  const prevDisabled = year < minYear || (year === minYear && month <= minMonth);
  const nextDisabled = year > todayYear || (year === todayYear && month >= todayMonth);

  const handlePrev = () => {
    setVisibleMonth(vm => shiftMonth(vm.year, vm.month, -1));
  };

  const handleNext = () => {
    setVisibleMonth(vm => shiftMonth(vm.year, vm.month, 1));
  };

  const handleDayClick = (clicked: string) => {
    const { from, to } = value;
    if (from === null || to !== null) {
      onChange({ from: clicked, to: null });
    } else if (clicked < from) {
      onChange({ from: clicked, to: null });
    } else {
      onChange({ from, to: clicked });
    }
  };

  const totalDays = daysInMonth(year, month);
  const blanks = leadingBlanks(year, month);

  const cells: Array<{
    day: number;
    iso: string;
    isDisabled: boolean;
    rangeAttr: "single" | "start" | "end" | "middle" | undefined;
    isPressed: boolean;
  } | null> = [];

  for (let i = 0; i < blanks; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= totalDays; d++) {
    const iso = isoDate(year, month, d);
    const isDisabled = iso > today || iso < minDate;
    const rangeAttr = getRangeAttr(iso, value.from, value.to);
    const isPressed = isAriaPressed(iso, value.from, value.to);
    cells.push({
      day: d,
      iso,
      isDisabled,
      rangeAttr,
      isPressed,
    });
  }

  const remainder = cells.length % 7;
  if (remainder !== 0) {
    const trailing = 7 - remainder;
    for (let i = 0; i < trailing; i++) {
      cells.push(null);
    }
  }

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="w-64 select-none p-2">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={prevDisabled}
          onClick={handlePrev}
          className="rounded p-1 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-text)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span aria-live="polite" className="text-sm font-semibold text-[var(--ui-text)]">
          {monthTitle(year, month)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          disabled={nextDisabled}
          onClick={handleNext}
          className="rounded p-1 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-text)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
              <th
                key={d}
                scope="col"
                className="h-8 w-8 text-center text-xs font-medium text-[var(--ui-text-muted)]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wIdx) => (
            <tr key={wIdx}>
              {week.map((cell, cIdx) => (
                <td key={cIdx} className="p-0 text-center">
                  {cell ? (
                    <button
                      type="button"
                      aria-label={`${cell.day} ${monthTitle(year, month)}`}
                      aria-pressed={cell.isPressed ? "true" : "false"}
                      data-range={cell.rangeAttr}
                      disabled={cell.isDisabled}
                      onClick={() => handleDayClick(cell.iso)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] ${
                        cell.isDisabled
                          ? "cursor-not-allowed text-[var(--ui-disabled-text)]"
                          : cell.rangeAttr === "start" ||
                              cell.rangeAttr === "end" ||
                              cell.rangeAttr === "single"
                            ? "bg-[var(--pos)] text-[var(--ui-elevated)]"
                            : cell.rangeAttr === "middle"
                              ? "bg-[var(--pos-bg)] text-[var(--pos-text)] hover:bg-[var(--ui-row-hover)]"
                              : "text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
                      }`}
                    >
                      {cell.day}
                    </button>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WealthGraph({
  status = "data",
  data,
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  today,
  benchmarkOptions,
  benchmark,
  onBenchmarkChange,
  hideValues = false,
  refreshing = false,
  onRetry,
  onImport,
  headerLeft,
  headerRightExtra,
  headline,
}: WealthGraphProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (period !== "custom") {
      setCalendarOpen(false);
    }
  }, [period]);

  // Escape closes the calendar popover and hands focus back to the button that opened it.
  const chooseDatesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCalendarOpen(false);
        chooseDatesRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendarOpen]);

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
        {headerLeft && <div className="flex items-center justify-between">{headerLeft}</div>}
        <p className="mt-4 text-sm text-[var(--ui-text-muted)]">
          Could not load your wealth graph.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const rangeText =
    customRange.from && customRange.to
      ? `${formatDayMonth(customRange.from)} – ${formatDayMonth(customRange.to)}`
      : null;

  const handlePeriodChange = (chosen: WealthPeriod) => {
    onPeriodChange(chosen);
    if (chosen === "custom") {
      setCalendarOpen(true);
    }
  };

  if (data.empty) {
    if (period === "custom") {
      return (
        <div className="relative rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
          {headerLeft && <div className="flex items-center justify-between">{headerLeft}</div>}

          <p className="my-6 text-sm text-[var(--ui-text-muted)]">
            No investments in this range.
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--ui-divider)]">
            <GraphPeriodSelector
              value={period}
              onChange={handlePeriodChange}
              customLabel={rangeText ?? undefined}
            />
            <button
              type="button"
              ref={chooseDatesRef}
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
              <GraphDateRangeCalendar
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
        {headerLeft && <div className="flex items-center justify-between">{headerLeft}</div>}

        <p className="mt-4 text-sm text-[var(--ui-text-muted)]">
          No investments yet.
        </p>

        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="mt-3 inline-flex items-center rounded-lg bg-[var(--ui-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Import statement
          </button>
        )}
      </div>
    );
  }

  const showBenchmarkLine = Boolean(
    data.benchmark &&
    data.benchmark.available &&
    data.benchmark.pct != null,
  );

  const hasSecondSeries = Boolean(
    data.benchmark &&
    data.benchmark.available &&
    !data.benchmark.clipped &&
    data.benchmark.points.length === data.points.length,
  );

  const secondSeries =
    hasSecondSeries && data.benchmark
      ? {
          name: data.benchmark.label,
          color: benchmarkColor(data.benchmark.index),
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
      notes.push(`Benchmark history starts on ${formatDate(data.benchmark.effective_start)}.`);
    }
  }
  const noteText = notes.join(" ");

  return (
    <div
      aria-busy={refreshing}
      className={`relative rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4 transition-opacity ${refreshing ? "opacity-60" : ""}`}
    >
      {/* Top row */}
      <div className={`flex items-center ${headerLeft ? "justify-between" : "justify-end"} gap-2`}>
        {headerLeft}

        <div className="flex items-center gap-2">
          {headerRightExtra}
          <GraphBenchmarkSelect
            options={benchmarkOptions}
            value={benchmark}
            onChange={onBenchmarkChange}
          />
        </div>
      </div>

      {/* Optional headline slot (e.g. Home WealthCard) */}
      {headline}

      {/* Benchmark line */}
      {showBenchmarkLine && data.benchmark && (
        <div
          data-testid="benchmark-line"
          className="text-xs font-medium"
          style={{ color: benchmarkColor(data.benchmark.index) }}
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
            hideValues
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
        <GraphPeriodSelector
          value={period}
          onChange={handlePeriodChange}
          customLabel={rangeText ?? undefined}
        />

        {period === "custom" ? (
          <button
            type="button"
            ref={chooseDatesRef}
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
          <GraphDateRangeCalendar
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
