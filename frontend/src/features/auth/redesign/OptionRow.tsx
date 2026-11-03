import { forwardRef } from "react";
import type { KeyboardEvent } from "react";

export interface OptionRowProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  /** Roving tab stop: only one answer of the group is reachable with Tab. */
  tabStop?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** One answer of a single-choice question: a radio button drawn as a card. */
export const OptionRow = forwardRef<HTMLButtonElement, OptionRowProps>(function OptionRow({ title, subtitle, selected, onSelect, tabStop = true, onKeyDown }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabStop ? 0 : -1}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        selected ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10" : "border-[var(--ui-divider)] bg-white"
      }`}
    >
      <span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span>
      <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{subtitle}</span>
    </button>
  );
});
