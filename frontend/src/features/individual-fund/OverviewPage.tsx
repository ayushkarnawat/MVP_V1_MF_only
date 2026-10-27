import { useParams } from "react-router";
import { fundPageApi } from "./api";
import { FundPageFrame } from "./FundPageFrame";
import { useFundPageScope, useFundSection } from "./useFundSection";
import { FundAllocation } from "./overview/FundAllocation";
import { InvestmentDetails } from "./overview/InvestmentDetails";
import { PerformanceChart } from "./overview/PerformanceChart";
import { ReturnsTable } from "./overview/ReturnsTable";
import { RiskMetrics } from "./overview/RiskMetrics";
import { StatBand } from "./overview/StatBand";
import { TopHoldings } from "./overview/TopHoldings";
import type { CompositionResponse, ScoreResponse } from "./types";

export function OverviewPage({ schemeId }: { schemeId: string }) {
  const scope = useFundPageScope();

  const score = useFundSection<ScoreResponse>(
    (signal) => fundPageApi.score(schemeId, scope, signal),
    [schemeId, scope]
  );

  // Fund-level composition: single request shared by Top 10 Holdings and Fund Allocation
  const composition = useFundSection<CompositionResponse>(
    (signal) => fundPageApi.composition(schemeId, signal),
    [schemeId]
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
        /* Narrow screen order: Performance, Details, Returns, Risk, Top 10, Allocation */
        <div
          data-testid="overview-grid"
          className="grid gap-5 xl:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]"
        >
          <div
            data-testid="overview-left"
            className="contents min-w-0 xl:block xl:space-y-5"
          >
            <div
              data-testid="slot-performance"
              className="order-1 min-w-0 xl:order-none"
            >
              <PerformanceChart
                schemeId={schemeId}
                fundName={ctx.summary.scheme.name}
              />
            </div>
            <div
              data-testid="slot-returns"
              className="order-3 min-w-0 xl:order-none"
            >
              <ReturnsTable
                schemeId={schemeId}
                scope={ctx.scope}
                fundName={ctx.summary.scheme.name}
              />
            </div>
            <div
              data-testid="slot-top-holdings"
              className="order-5 min-w-0 xl:order-none"
            >
              <TopHoldings schemeId={schemeId} composition={composition} />
            </div>
          </div>

          <div
            data-testid="overview-right"
            className="contents min-w-0 xl:block xl:space-y-5"
          >
            <div
              data-testid="slot-details"
              className="order-2 min-w-0 xl:order-none"
            >
              <InvestmentDetails
                summary={ctx.summary}
                refreshing={ctx.refreshing}
              />
            </div>
            <div
              data-testid="slot-risk"
              className="order-4 min-w-0 xl:order-none"
            >
              <RiskMetrics schemeId={schemeId} />
            </div>
            <div
              data-testid="slot-allocation"
              className="order-6 min-w-0 xl:order-none"
            >
              <FundAllocation
                composition={composition}
                currentValue={
                  ctx.summary.held ? ctx.summary.tiles.current_value : null
                }
              />
            </div>
          </div>
        </div>
      )}
    </FundPageFrame>
  );
}

export default function OverviewRoute() {
  const { schemeId } = useParams();
  return <OverviewPage schemeId={schemeId ?? ""} />;
}
