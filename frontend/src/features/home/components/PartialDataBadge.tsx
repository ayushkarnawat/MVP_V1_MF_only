import { TriangleAlert } from "lucide-react";
import type { MissingFund } from "../types";

export interface PartialDataBadgeProps {
  missingFunds: MissingFund[];
}

export function PartialDataBadge({ missingFunds }: PartialDataBadgeProps) {
  if (!missingFunds || missingFunds.length === 0) {
    return null;
  }

  const names = missingFunds.map(f => f.name).join(", ");

  return (
    <span
      role="note"
      title={`Missing: ${names}`}
      aria-label={`Partial data. Missing: ${names}`}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--warn-bg)] text-[var(--warn-text)]"
    >
      <TriangleAlert size={14} aria-hidden="true" />
      <span>Partial data</span>
    </span>
  );
}
