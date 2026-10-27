import { useState } from "react";
import { SectionState } from "../components/SectionState";
import { NO_INSIGHTS_TEXT } from "../fundCopy";
import type { Fact, InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { EvidenceDialog } from "./EvidenceDialog";
import { FactRow } from "./FactRow";

export interface InsightListProps {
  insights: FundSection<InsightsResponse>;
}

export function InsightList({ insights }: InsightListProps) {
  const [fact, setFact] = useState<Fact | null>(null);

  const keyFacts = insights.data?.key ?? [];

  return (
    <section
      aria-labelledby="key-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <h3
        id="key-title"
        className="text-base font-semibold text-[var(--ui-text)]"
      >
        Key Insights
      </h3>

      <SectionState
        status={insights.status}
        label="key insights"
        reason={insights.reason}
        onRetry={insights.retry}
      >
        {keyFacts.length === 0 ? (
          <p
            data-testid="key-empty"
            className="text-sm text-[var(--ui-text-muted)]"
          >
            {NO_INSIGHTS_TEXT}
          </p>
        ) : (
          <ul aria-label="Key insights" className="space-y-0.5">
            {keyFacts.map((item) => (
              <FactRow key={item.id} fact={item} onOpen={setFact} />
            ))}
          </ul>
        )}
      </SectionState>

      <EvidenceDialog fact={fact} onClose={() => setFact(null)} />
    </section>
  );
}
