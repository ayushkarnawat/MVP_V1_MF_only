import type { KeyboardEvent } from "react";

export interface SegmentedTabsProps<V extends string> {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  /** The id of the panel the tabs switch. The selected tab points to it with `aria-controls`; each tab gets the id `${panelId}-tab-${value}`. The panel is left unnamed on purpose: naming it after the tab would give two things the same name as the field inside. */
  panelId?: string;
}

export function SegmentedTabs<V extends string>({ label, options, value, onChange, panelId }: SegmentedTabsProps<V>) {
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
    // Focus follows the selection, or the next arrow key would start again from the tab that still has focus.
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
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
            id={panelId ? `${panelId}-tab-${option.value}` : undefined}
            aria-controls={panelId && selected ? panelId : undefined}
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
