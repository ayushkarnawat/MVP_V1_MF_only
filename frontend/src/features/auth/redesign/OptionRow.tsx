import { forwardRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { IconBadge } from "./IconBadge";

export interface OptionRowProps {
  title: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  /** Roving tab stop: only one answer of the group is reachable with Tab. */
  tabStop?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  divider?: boolean;
}

/** One answer of a single-choice question: a radio button drawn as a list row. */
export const OptionRow = forwardRef<HTMLButtonElement, OptionRowProps>(function OptionRow(
  { title, selected, onSelect, icon, tabStop = true, onKeyDown, divider },
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
      className={`auth-option flex w-full items-center gap-3 px-[18px] text-left min-h-[var(--auth-option-h)]${
        divider ? " border-b" : ""
      }`}
    >
      {icon ? <IconBadge icon={icon} tone="strong" /> : null}
      <span className="min-w-0 flex-1 block">
        <span className="block text-[15px] font-semibold text-[var(--auth-ink)]">{title}</span>
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
