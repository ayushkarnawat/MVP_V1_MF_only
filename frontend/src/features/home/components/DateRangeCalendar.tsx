import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  daysInMonth,
  isoDate,
  leadingBlanks,
  minSelectableDate,
  monthTitle,
  shiftMonth,
} from "./calendarMath";

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface DateRangeCalendarProps {
  today: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
  maxYears?: number;
}

function getRangeAttr(
  iso: string,
  from: string | null,
  to: string | null
): "single" | "start" | "end" | "middle" | undefined {
  if (!from) return undefined;
  if (to !== null && from === to && iso === from) {
    return "single";
  }
  if (iso === from && (to === null || to !== from)) {
    return "start";
  }
  if (to !== null && iso === to && from !== to) {
    return "end";
  }
  if (to !== null && iso > from && iso < to) {
    return "middle";
  }
  return undefined;
}

function isAriaPressed(
  iso: string,
  from: string | null,
  to: string | null
): boolean {
  if (!from) return false;
  const end = to ?? from;
  return iso >= from && iso <= end;
}

export function DateRangeCalendar({
  today,
  value,
  onChange,
  maxYears = 10,
}: DateRangeCalendarProps) {
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

  const prevDisabled =
    year < minYear || (year === minYear && month <= minMonth);
  const nextDisabled =
    year > todayYear || (year === todayYear && month >= todayMonth);

  const handlePrev = () => {
    setVisibleMonth((vm) => shiftMonth(vm.year, vm.month, -1));
  };

  const handleNext = () => {
    setVisibleMonth((vm) => shiftMonth(vm.year, vm.month, 1));
  };

  const handleDayClick = (clicked: string) => {
    const { from, to } = value;
    if (from === null || to !== null) {
      onChange({ from: clicked, to: null });
    } else {
      if (clicked < from) {
        onChange({ from: clicked, to: null });
      } else {
        onChange({ from, to: clicked });
      }
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
        <span
          aria-live="polite"
          className="text-sm font-semibold text-[var(--ui-text)]"
        >
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
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
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
