import type { Tone } from "../scenarioFormat";

export interface StatTileProps {
  tileKey: string;
  caption: string;
  value: string;
  tone?: Tone;
  line?: string | null;
  lineTone?: Tone;
  note?: string | null;
}

export function StatTile({
  tileKey,
  caption,
  value,
  tone = "neutral",
  line = null,
  lineTone = "neutral",
  note = null,
}: StatTileProps) {
  const valueColor =
    tone === "gain"
      ? "text-[var(--pos-text)]"
      : tone === "loss"
        ? "text-[var(--neg-text)]"
        : "text-[var(--ui-text)]";

  const lineColor =
    lineTone === "gain"
      ? "text-[var(--pos-text)]"
      : lineTone === "loss"
        ? "text-[var(--neg-text)]"
        : "text-[var(--ui-text-muted)]";

  return (
    <div
      role="group"
      aria-label={caption}
      data-testid={`tile-${tileKey}`}
      className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3.5"
    >
      <div className="text-xs text-[var(--ui-text-muted)]">{caption}</div>
      <div
        data-testid={`tile-${tileKey}-value`}
        data-tone={tone}
        className={`my-0.5 break-words font-heading text-2xl font-bold tabular-nums ${valueColor}`}
      >
        {value}
      </div>
      {line !== null && line !== "" && (
        <div
          data-testid={`tile-${tileKey}-line`}
          className={`text-xs font-semibold ${lineColor}`}
        >
          {line}
        </div>
      )}
      {note !== null && note !== "" && (
        <div
          data-testid={`tile-${tileKey}-note`}
          className="mt-1 text-xs text-[var(--ui-text-muted)]"
        >
          {note}
        </div>
      )}
    </div>
  );
}
