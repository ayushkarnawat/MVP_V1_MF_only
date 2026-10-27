import type { KeyboardEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_CARD } from "@/lib/clickable";
import { buildGlanceSentence } from "../homeCopy";
import type { MoversResponse, SummaryResponse } from "../types";

export interface GlanceProps {
  status: "loading" | "error" | "data";
  summary: SummaryResponse | null;
  movers: MoversResponse | null;
  onOpen: () => void;
}

export function Glance({ status, summary, movers, onOpen }: GlanceProps) {
  if (status === "loading") {
    return (
      <div role="status" aria-label="Loading summary">
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (status === "error" || !summary || !summary.has_holdings) {
    return null;
  }

  const sentence = buildGlanceSentence(summary, movers);
  if (!sentence) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      onOpen();
    } else if (event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`${CLICK_CARD} rounded-xl bg-[var(--ui-elevated)] p-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
          <Sparkles size={16} className="text-[var(--ui-accent)]" aria-hidden="true" />
          <span>Your money, at a glance</span>
        </h3>
        <div className="flex items-center gap-1 text-xs font-medium text-[var(--ui-accent)]">
          <span>Understand today&apos;s change</span>
          <ArrowRight size={14} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--ui-text)] leading-relaxed">
        {sentence}
      </p>
      <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
        Based on available investment data
      </p>
    </div>
  );
}
