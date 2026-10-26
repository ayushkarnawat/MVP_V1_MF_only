import { useParams } from "react-router";
import { fundPageApi } from "./api";
import { FundPageFrame } from "./FundPageFrame";
import { useFundPageScope, useFundSection } from "./useFundSection";
import { PerformanceChart } from "./overview/PerformanceChart";
import { ReturnsTable } from "./overview/ReturnsTable";
import { StatBand } from "./overview/StatBand";
import type { ScoreResponse } from "./types";

export function OverviewPage({ schemeId }: { schemeId: string }) {
  const scope = useFundPageScope();

  const score = useFundSection<ScoreResponse>(
    (signal) => fundPageApi.score(schemeId, scope, signal),
    [schemeId, scope]
  );

  return (
    <FundPageFrame
      schemeId={schemeId}
      tab="overview"
      aboveTabs={(ctx) => (
        <StatBand
          summary={ctx.summary}
          score={score}
          refreshing={ctx.refreshing}
        />
      )}
    >
      {(ctx) => (
        <div
          data-testid="overview-grid"
          className="grid gap-5 xl:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]"
        >
          <div data-testid="overview-left" className="min-w-0 space-y-5">
            <PerformanceChart
              schemeId={schemeId}
              fundName={ctx.summary.scheme.name}
            />
            <ReturnsTable
              schemeId={schemeId}
              scope={ctx.scope}
              fundName={ctx.summary.scheme.name}
            />
          </div>
          {/* Packet IF-B populates the right column */}
          <div data-testid="overview-right" className="min-w-0 space-y-5" />
        </div>
      )}
    </FundPageFrame>
  );
}

export default function OverviewRoute() {
  const { schemeId } = useParams();
  return <OverviewPage schemeId={schemeId ?? ""} />;
}
