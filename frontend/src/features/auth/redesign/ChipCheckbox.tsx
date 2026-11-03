import { forwardRef } from "react";

export interface ChipCheckboxProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

/** One answer of a multiple-choice question: a checkbox drawn as a chip. */
export const ChipCheckbox = forwardRef<HTMLButtonElement, ChipCheckboxProps>(function ChipCheckbox({ label, checked, onToggle }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`rounded-full border px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        checked ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10 font-semibold text-[var(--ui-text)]" : "border-[var(--ui-divider)] bg-white text-[var(--ui-text-muted)]"
      }`}
    >
      {label}
    </button>
  );
});
