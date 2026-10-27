import { useState } from "react";
import { ChevronRight, Lightbulb, MessageCircle } from "lucide-react";
import { CLICK_CARD } from "@/lib/clickable";
import { MiraComingSoonDialog } from "@/shell/mira/MiraComingSoonDialog";
import { SectionState } from "../components/SectionState";
import {
  NO_INSIGHTS_TEXT,
  SMART_INSIGHTS_SUBTITLE,
  factTitle,
} from "../fundCopy";
import { toneChipClass } from "../fundFormat";
import type { Fact, InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { EvidenceDialog } from "./EvidenceDialog";
import { ToneIcon } from "./FactRow";

export interface SmartInsightsCardsProps {
  insights: FundSection<InsightsResponse>;
}

export function SmartInsightsCards({ insights }: SmartInsightsCardsProps) {
  const [fact, setFact] = useState<Fact | null>(null);
  const [miraOpen, setMiraOpen] = useState(false);

  const topThree = insights.data?.top_three ?? [];

  return (
    <section
      aria-labelledby="smart-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`${toneChipClass("info")} h-9 w-9 shrink-0 !p-0`}
          >
            <Lightbulb size={18} aria-hidden="true" />
          </span>
          <div>
            <h3
              id="smart-title"
              className="text-base font-semibold text-[var(--ui-text)]"
            >
              Smart Insights{" "}
              <span
                data-testid="smart-beta"
                className="rounded border border-[var(--ui-divider)] px-1.5 py-0.5 text-xs font-normal text-[var(--ui-text-muted)]"
              >
                Beta
              </span>
            </h3>
            <p className="text-xs text-[var(--ui-text-muted)]">
              {SMART_INSIGHTS_SUBTITLE}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMiraOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-hover)]"
        >
          <MessageCircle size={14} aria-hidden="true" />
          Ask Mira a follow-up
        </button>
      </div>

      <SectionState
        status={insights.status}
        label="smart insights"
        reason={insights.reason}
        onRetry={insights.retry}
      >
        {topThree.length === 0 ? (
          <p
            data-testid="smart-empty"
            className="text-sm text-[var(--ui-text-muted)]"
          >
            {NO_INSIGHTS_TEXT}
          </p>
        ) : (
          <ul
            aria-label="Top three insights"
            className="grid gap-4 md:grid-cols-3"
          >
            {topThree.map((item, index) => {
              const handleKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  setFact(item);
                } else if (e.key === " ") {
                  e.preventDefault();
                  setFact(item);
                }
              };

              return (
                <li key={item.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    data-testid={`smart-card-${index}`}
                    data-fact={item.id}
                    className={`${CLICK_CARD} block h-full rounded-xl bg-[var(--ui-card)] p-4`}
                    onClick={() => setFact(item)}
                    onKeyDown={handleKeyDown}
                  >
                    <div className="flex items-center gap-2">
                      <ToneIcon tone={item.tone} />
                      <b
                        data-testid="smart-card-title"
                        className="text-sm font-semibold text-[var(--ui-text)]"
                      >
                        {factTitle(item.id)}
                      </b>
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="ml-auto text-[var(--ui-text-muted)]"
                      />
                    </div>
                    <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
                      {item.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionState>

      <EvidenceDialog fact={fact} onClose={() => setFact(null)} />
      <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
    </section>
  );
}
