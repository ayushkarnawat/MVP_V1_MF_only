import { formatDataDate } from "../../../lib/dataDates";
import { InfoMark } from "../common/SectionCard";
import type { OlderMarker, StripEntry } from "./stripEntries";

export interface DateStripProps {
  entries: StripEntry[];
  olderMarkers: OlderMarker[];
}

export function DateStrip({ entries, olderMarkers }: DateStripProps) {
  if (entries.length === 0) return null;

  const line = entries
    .map((entry) => formatDataDate(entry.kind, entry.iso))
    .filter(Boolean)
    .join(" · ");

  const explainText = entries.map((entry) => entry.explain).join(" ");

  return (
    <div
      data-testid="date-strip"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-2 text-xs"
    >
      <span data-testid="date-strip-line" className="font-medium text-[var(--ui-text-muted)]">
        {line}
      </span>
      <InfoMark testId="date-strip-info" text={explainText} />
      {olderMarkers.map((marker, index) => (
        <span
          key={`${marker.label}-${index}`}
          data-testid="date-strip-older"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[var(--warn-bg)] px-2.5 py-0.5 font-medium text-[var(--warn-text)]"
        >
          {marker.label}
          <InfoMark testId="date-strip-older-info" text={marker.items.join(", ")} />
        </span>
      ))}
    </div>
  );
}
