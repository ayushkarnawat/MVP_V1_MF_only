import { Eye, EyeOff } from "lucide-react";

export interface HideValuesButtonProps {
  hidden: boolean;
  onToggle: () => void;
}

export function HideValuesButton({ hidden, onToggle }: HideValuesButtonProps) {
  const label = hidden ? "Show values" : "Hide values";
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={hidden}
      onClick={onToggle}
      className="inline-flex items-center justify-center rounded border border-[var(--ui-border)] p-1.5 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
