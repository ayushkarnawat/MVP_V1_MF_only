import type { KeyboardEvent } from "react";

export interface SegmentedTabsProps<V extends string> {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

export function SegmentedTabs<V extends string>({ label, options, value, onChange }: SegmentedTabsProps<V>) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = options.length - 1;
    let to = from;
    if (event.key === "ArrowRight") to = from === last ? 0 : from + 1;
    else if (event.key === "ArrowLeft") to = from === 0 ? last : from - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = last;
    else return;
    event.preventDefault();
    onChange(options[to].value);
  };
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded-xl bg-[var(--ui-hover)] p-1">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${selected ? "bg-white text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)]"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
