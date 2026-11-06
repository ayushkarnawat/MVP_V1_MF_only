import { forwardRef } from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

export interface ChipCheckboxProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  invalid?: boolean;
}

/** One answer of a multiple-choice question: a checkbox drawn as a chip. */
export const ChipCheckbox = forwardRef<HTMLButtonElement, ChipCheckboxProps>(function ChipCheckbox(
  { label, checked, onToggle, icon, invalid },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      data-invalid={invalid ? "true" : undefined}
      className="auth-choice flex items-center gap-2 rounded-[14px] px-2.5 text-left min-h-[var(--auth-chip-h)] w-full"
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 flex items-center text-[var(--auth-muted)] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-tight text-[var(--auth-ink)]">
        {label}
      </span>
      <span
        aria-hidden="true"
        data-testid="chip-box"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] ${
          checked ? "border-[var(--auth-green)] bg-[var(--auth-green)]" : "border-[#C9CED6]"
        }`}
      >
        {checked ? <Check size={14} strokeWidth={3} className="text-white" aria-hidden="true" /> : null}
      </span>
    </button>
  );
});
