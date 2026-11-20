export interface BenchmarkLegendItem {
  id: string;
  label: string;
  color: string;
}

export interface BenchmarkLegendProps {
  items: BenchmarkLegendItem[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function BenchmarkLegend({ items, hidden, onToggle }: BenchmarkLegendProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Benchmarks"
      className="flex flex-wrap items-center gap-1.5"
    >
      {items.map(item => {
        const isHidden = hidden.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`legend-chip-${item.id}`}
            aria-pressed={!isHidden}
            onClick={() => onToggle(item.id)}
            className={`inline-flex min-h-[24px] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4 transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)] ${
              isHidden
                ? "border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:border-[var(--ui-border-hover)]"
                : "border-[var(--ui-disabled-border)] bg-[var(--ui-elevated)] text-[var(--ui-text)] hover:border-[var(--ui-border-hover)] hover:bg-[var(--ui-card)]"
            }`}
          >
            <span
              aria-hidden="true"
              data-testid={`legend-swatch-${item.id}`}
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full transition-opacity motion-reduce:transition-none ${
                isHidden ? "opacity-40" : ""
              }`}
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
