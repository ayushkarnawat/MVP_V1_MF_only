import { useRef } from "react";
import type { HomePeriod } from "../types";

export interface PeriodSelectorProps {
  value: HomePeriod;
  onChange: (period: HomePeriod) => void;
  customLabel?: string;
  disabled?: boolean;
}

const PERIODS: { value: HomePeriod; defaultLabel: string }[] = [
  { value: "1D", defaultLabel: "1D" },
  { value: "1W", defaultLabel: "1W" },
  { value: "1M", defaultLabel: "1M" },
  { value: "1Y", defaultLabel: "1Y" },
  { value: "custom", defaultLabel: "Custom" },
];

export function PeriodSelector({
  value,
  onChange,
  customLabel,
  disabled = false,
}: PeriodSelectorProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
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
        const label =
          p.value === "custom" && customLabel ? customLabel : p.defaultLabel;

        return (
          <button
            key={p.value}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isChecked ? "true" : "false"}
            tabIndex={isChecked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
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
