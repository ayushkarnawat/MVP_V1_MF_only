import { useState } from "react";
import { Flag, ThumbsUp } from "lucide-react";
import { SectionState } from "../components/SectionState";
import { NO_INSIGHTS_TEXT } from "../fundCopy";
import { toneChipClass } from "../fundFormat";
import type { Fact, InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { EvidenceDialog } from "./EvidenceDialog";
import { FactRow } from "./FactRow";

export interface StrengthsConsiderationsProps {
  insights: FundSection<InsightsResponse>;
}

export function StrengthsConsiderations({
  insights,
}: StrengthsConsiderationsProps) {
  const [fact, setFact] = useState<Fact | null>(null);

  const strengths = insights.data?.strengths ?? [];
  const considerations = insights.data?.considerations ?? [];
  const bothEmpty = strengths.length === 0 && considerations.length === 0;

  return (
    <section
      aria-labelledby="sc-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <h3
        id="sc-title"
        className="text-base font-semibold text-[var(--ui-text)]"
      >
        Strengths and Considerations
      </h3>

      <SectionState
        status={insights.status}
        label="strengths and considerations"
        reason={insights.reason}
        onRetry={insights.retry}
      >
        {bothEmpty ? (
          <p
            data-testid="sc-empty"
            className="text-sm text-[var(--ui-text-muted)]"
          >
            {NO_INSIGHTS_TEXT}
          </p>
        ) : (
          <div data-testid="sc-lists" className="space-y-5">
            {strengths.length > 0 && (
              <div data-testid="sc-strengths">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <span
                    aria-hidden="true"
                    className={`${toneChipClass("pos")} h-6 w-6 !p-0`}
                  >
                    <ThumbsUp size={13} aria-hidden="true" />
                  </span>
                  Strengths
                </h4>
                <ul aria-label="Strengths" className="mt-1 space-y-0.5">
                  {strengths.map((item) => (
                    <FactRow key={item.id} fact={item} onOpen={setFact} />
                  ))}
                </ul>
              </div>
            )}
            {considerations.length > 0 && (
              <div data-testid="sc-considerations">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <span
                    aria-hidden="true"
                    className={`${toneChipClass("warn")} h-6 w-6 !p-0`}
                  >
                    <Flag size={13} aria-hidden="true" />
                  </span>
                  Considerations
                </h4>
                <ul aria-label="Considerations" className="mt-1 space-y-0.5">
                  {considerations.map((item) => (
                    <FactRow key={item.id} fact={item} onOpen={setFact} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SectionState>

      <EvidenceDialog fact={fact} onClose={() => setFact(null)} />
    </section>
  );
}
