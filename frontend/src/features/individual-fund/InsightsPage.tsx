import { useParams } from "react-router";
import { fundPageApi } from "./api";
import { FundPageFrame } from "./FundPageFrame";
import { FundManagerCard } from "./insights/FundManagerCard";
import { InsightList } from "./insights/InsightList";
import { PeriodReturnsChart } from "./insights/PeriodReturnsChart";
import { RiskReturnScatter } from "./insights/RiskReturnScatter";
import { RollingReturnsChart } from "./insights/RollingReturnsChart";
import { SmartInsightsCards } from "./insights/SmartInsightsCards";
import { StrengthsConsiderations } from "./insights/StrengthsConsiderations";
import type { InsightsResponse } from "./types";
import { useFundPageScope, useFundSection } from "./useFundSection";

export interface InsightsPageProps {
  schemeId: string;
}

export function InsightsPage({ schemeId }: InsightsPageProps) {
  const scope = useFundPageScope();

  // One insights request shared across the three insight cards
  const insights = useFundSection<InsightsResponse>(
    (signal) => fundPageApi.insights(schemeId, scope, signal),
    [schemeId, scope]
  );

  return (
    <FundPageFrame schemeId={schemeId} tab="insights">
      {() => (
        <div
          data-testid="insights-grid"
          className="grid gap-5 min-[1100px]:grid-cols-2"
        >
          <div
            data-testid="slot-smart"
            className="min-w-0 min-[1100px]:col-span-2"
          >
            <SmartInsightsCards insights={insights} />
          </div>
          <div data-testid="slot-key" className="min-w-0">
            <InsightList insights={insights} />
          </div>
          <div data-testid="slot-strengths" className="min-w-0">
            <StrengthsConsiderations insights={insights} />
          </div>
          <div data-testid="slot-rolling" className="min-w-0">
            <RollingReturnsChart schemeId={schemeId} />
          </div>
          <div data-testid="slot-period" className="min-w-0">
            <PeriodReturnsChart schemeId={schemeId} />
          </div>
          <div data-testid="slot-scatter" className="min-w-0">
            <RiskReturnScatter schemeId={schemeId} />
          </div>
          <div data-testid="slot-manager" className="min-w-0">
            <FundManagerCard schemeId={schemeId} />
          </div>
        </div>
      )}
    </FundPageFrame>
  );
}

export default function InsightsRoute() {
  const { schemeId } = useParams();
  return <InsightsPage schemeId={schemeId ?? ""} />;
}
