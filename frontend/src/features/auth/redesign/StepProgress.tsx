export interface StepProgressProps {
  step: number;
  total?: number;
  /** The last screen: the label says Done and every segment is full. */
  done?: boolean;
}

export function StepProgress({ step, total = 5, done = false }: StepProgressProps) {
  const current = Math.min(Math.max(Math.round(step), 1), total);
  const label = done ? "Done" : `Step ${current} of ${total}`;
  const filled = done ? total : current;
  return (
    <div role="group" aria-label={label} className="flex items-center gap-4">
      <span className="text-[13px] font-medium text-[var(--auth-muted)]">{label}</span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            data-testid="step-segment"
            data-filled={index < filled}
            className="h-[6px] w-9 rounded-full"
            style={{ background: index < filled ? "var(--auth-step-on)" : "var(--auth-step-off)" }}
          />
        ))}
      </div>
    </div>
  );
}
