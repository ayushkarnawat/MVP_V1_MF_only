import type { SortOrder } from "@/lib/allocationSort";
import { cn } from "@/lib/utils";

export function AllocationSortToggle({ order, onChange }: { order: SortOrder; onChange: (o: SortOrder) => void }) {
  return <div role="group" aria-label="Allocation sort order" className="inline-flex self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
    {([ ["asc", "Smallest first"], ["desc", "Largest first"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={order === value} onClick={() => onChange(value)} className={cn(
      "min-h-11 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
      order === value ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-2xs" : "text-[var(--color-text-secondary)]",
    )}>{label}</button>)}
  </div>;
}
