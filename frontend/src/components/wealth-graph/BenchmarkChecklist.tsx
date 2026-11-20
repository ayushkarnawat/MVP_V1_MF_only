import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { benchmarkColor } from "./benchmarkColors";
import type { WealthBenchmarkOption } from "./types";
import { MAX_BENCHMARKS } from "./benchmarkChoice";

export interface BenchmarkChecklistProps {
  options: readonly WealthBenchmarkOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  max?: number;
}

export function BenchmarkChecklist({
  options,
  values,
  onChange,
  disabled = false,
  max = MAX_BENCHMARKS,
}: BenchmarkChecklistProps) {
  const [open, setOpen] = useState(false);
  const [attemptedOverLimit, setAttemptedOverLimit] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const isDisabled = disabled || options.length === 0;
  const panelOpen = open && !isDisabled;
  const showLimitMessage = attemptedOverLimit && values.length >= max;

  useEffect(() => {
    if (!panelOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setAttemptedOverLimit(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setAttemptedOverLimit(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelOpen]);

  const toggleOpen = () => {
    if (isDisabled) return;
    setOpen((prev) => {
      if (prev) {
        setAttemptedOverLimit(false);
      }
      return !prev;
    });
  };

  const handleToggleOption = (index: string) => {
    if (isDisabled) return;
    const isChecked = values.includes(index);

    if (isChecked) {
      if (values.length <= 1) return;
      setAttemptedOverLimit(false);
      onChange(values.filter((value) => value !== index));
      return;
    }

    if (values.length >= max) {
      setAttemptedOverLimit(true);
      return;
    }

    setAttemptedOverLimit(false);
    onChange([...values, index]);
  };

  const singleOption =
    values.length === 1
      ? options.find((option) => option.index === values[0])
      : undefined;

  const triggerText =
    values.length === 1
      ? (singleOption?.label ?? "1 benchmark")
      : values.length > 1
        ? `${values.length} benchmarks`
        : "Benchmarks";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-haspopup="true"
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? panelId : undefined}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            toggleOpen();
          }
        }}
        className="inline-flex min-h-[28px] items-center gap-2 rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] transition-colors motion-reduce:transition-none hover:border-[var(--ui-border-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:border-[var(--ui-disabled-border)] disabled:text-[var(--ui-disabled-text)]"
      >
        {values.length === 1 && singleOption ? (
          <span className="sr-only">Benchmark: </span>
        ) : null}
        <span>{triggerText}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-[var(--ui-text-muted)] transition-transform motion-reduce:transition-none ${
            panelOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {panelOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="Benchmarks"
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[240px] rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2 shadow-lg"
        >
          <div className="flex flex-col gap-0.5">
            {options.map((option) => {
              const isChecked = values.includes(option.index);
              const isOnlyChecked = isChecked && values.length <= 1;
              const isOverLimit = !isChecked && values.length >= max;
              const isBlocked = isOnlyChecked || isOverLimit;

              return (
                <label
                  key={option.index}
                  className={`flex min-h-[32px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none ${
                    isOverLimit
                      ? "cursor-not-allowed text-[var(--ui-text-muted)] opacity-70"
                      : isOnlyChecked
                        ? "cursor-not-allowed text-[var(--ui-text)]"
                        : "cursor-pointer text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    aria-disabled={isBlocked ? "true" : undefined}
                    onChange={() => handleToggleOption(option.index)}
                    onKeyDown={(event) => {
                      if (event.key === " ") {
                        event.preventDefault();
                        handleToggleOption(option.index);
                      }
                    }}
                    className="h-4 w-4 shrink-0 rounded accent-[var(--pos)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
                  />
                  <span
                    aria-hidden="true"
                    data-testid={`benchmark-swatch-${option.index}`}
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: benchmarkColor(option.index) }}
                  />
                  <span className="truncate">
                    {option.label}
                    {option.recommended && (
                      <>
                        {" "}
                        <span className="text-[var(--ui-text-muted)]">(recommended)</span>
                      </>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {showLimitMessage && (
            <p
              role="status"
              aria-live="polite"
              className="mt-1.5 rounded-md bg-[var(--warn-bg)] px-2 py-1 text-xs font-medium text-[var(--warn-text)]"
            >
              {`Choose up to ${max}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
