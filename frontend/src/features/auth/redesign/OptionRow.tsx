import { forwardRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { IconBadge } from "./IconBadge";

export interface OptionRowProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  /** Roving tab stop: only one answer of the group is reachable with Tab. */
  tabStop?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** One answer of a single-choice question: a radio button drawn as a card. */
export const OptionRow = forwardRef<HTMLButtonElement, OptionRowProps>(function OptionRow(
  { title, subtitle, selected, onSelect, icon, tabStop = true, onKeyDown },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabStop ? 0 : -1}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      className="flex w-full items-center gap-3.5 rounded-2xl px-4 text-left min-h-[var(--auth-row-h)] auth-choice"
    >
      {icon ? <IconBadge icon={icon} tone="strong" /> : null}
      <span className="min-w-0 flex-1 block">
        <span className="block text-[15px] font-semibold text-[var(--auth-ink)]">{title}</span>
        <span className="block text-[13px] leading-[1.3] text-[var(--auth-muted)]">{subtitle}</span>
      </span>
      <span
        aria-hidden="true"
        data-testid="option-radio"
        className={`ml-auto grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] ${
          selected ? "border-[var(--auth-green)]" : "border-[#C9CED6]"
        }`}
      >
        {selected ? <span className="h-[10px] w-[10px] rounded-full bg-[var(--auth-green)]" /> : null}
      </span>
    </button>
  );
});
