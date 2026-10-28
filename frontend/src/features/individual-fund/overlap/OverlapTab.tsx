import { useState } from "react";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import type { FundPageContext } from "../FundPageFrame";
import type { OverlapResponse } from "../types";
import { useFundSection } from "../useFundSection";
import { ComparisonState } from "./ComparisonState";
import { NormalState } from "./NormalState";

export interface OverlapTabProps {
  ctx: FundPageContext;
}

export function OverlapTab({ ctx }: OverlapTabProps) {
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [lastCompared, setLastCompared] = useState<string | null>(null);

  const overlap = useFundSection<OverlapResponse>(
    (signal) => fundPageApi.overlap(ctx.schemeId, ctx.scope, signal),
    [ctx.schemeId, ctx.scope]
  );

  if (compareWith !== null) {
    return (
      <ComparisonState
        ctx={ctx}
        otherSchemeId={compareWith}
        onBack={() => {
          setLastCompared(compareWith);
          setCompareWith(null);
        }}
      />
    );
  }

  return (
    <SectionState
      status={overlap.status}
      label="overlap"
      reason={overlap.reason}
      onRetry={overlap.retry}
    >
      {overlap.data && (
        <NormalState
          overlap={overlap.data}
          fundName={ctx.summary.scheme.name}
          onCompare={setCompareWith}
          restoreFocusId={lastCompared}
        />
      )}
    </SectionState>
  );
}
