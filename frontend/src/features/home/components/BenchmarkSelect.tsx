import type { BenchmarkOptionOut } from "../types";

export interface BenchmarkSelectProps {
  options: BenchmarkOptionOut[];
  value: string | null;
  onChange: (index: string) => void;
  disabled?: boolean;
}

export function BenchmarkSelect({
  options,
  value,
  onChange,
  disabled = false,
}: BenchmarkSelectProps) {
  const isDisabled = disabled || options.length === 0;

  return (
    <select
      aria-label="Benchmark"
      value={value ?? ""}
      disabled={isDisabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2 py-1 text-sm text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-text)]"
    >
      {options.map((option) => (
        <option key={option.index} value={option.index}>
          {option.recommended ? `${option.label} (recommended)` : option.label}
        </option>
      ))}
    </select>
  );
}
