export interface PanFieldProps {
  panMasked: string | null;
  conflict?: boolean;
}

// Full PAN value is never shown on Profile (decision L49)
export function PanField({ panMasked, conflict = false }: PanFieldProps) {
  if (!panMasked) {
    return (
      <span
        data-testid="pan-field"
        data-state="empty"
        className="text-sm text-[var(--ui-text-muted)]"
      >
        Not added
      </span>
    );
  }

  return (
    <span
      data-testid="pan-field"
      data-state="masked"
      className="inline-flex flex-wrap items-center gap-2"
    >
      <span
        data-testid="pan-value"
        className="font-mono text-sm font-semibold tracking-wide text-[var(--ui-text)]"
      >
        {panMasked}
      </span>
      {conflict ? (
        <span
          data-testid="pan-conflict"
          className="rounded-full border border-[var(--ui-divider)] bg-[var(--ui-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-text-muted)]"
        >
          On another Unifolio account
        </span>
      ) : null}
    </span>
  );
}
