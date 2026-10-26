export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedProps<V extends string> {
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<V>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-[var(--ui-hover)] p-0.5"
    >
      {options.map((option) => {
        const isPressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isPressed}
            onClick={() => {
              if (option.value !== value) {
                onChange(option.value);
              }
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isPressed
                ? "bg-[var(--ui-text)] text-[var(--ui-page)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
