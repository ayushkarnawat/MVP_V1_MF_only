import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import { TerLadder } from "./TerLadder";
import { ValuationSpectrum } from "./ValuationSpectrum";

export function CostValuationGroup() {
  const ter = useMfAnalytics("ter");
  const comparison = useMfAnalytics("ter_direct_regular");
  const ranking = useMfAnalytics("category_ranking");
  const valuation = useMfAnalytics("valuation");

  return (
    <div className="flex flex-col gap-[18px]">
      <div data-testid="card-ter">
        <SectionCard
          title="Total Expense Ratio (TER) & Cost Analysis"
          info="AUM-weighted annual management fee across your portfolio, split by Direct vs. Regular plans, with a per-fund cost breakdown."
          state={ter.status}
          onRetry={ter.retry}
        >
          {ter.data && (
            <TerLadder
              ter={ter.data}
              comparison={comparison.data}
              ranking={ranking.data}
            />
          )}
        </SectionCard>
      </div>

      <div data-testid="card-valuation">
        <SectionCard
          title="Portfolio Valuation vs. Benchmarks"
          info="Your portfolio's look-through P/E and P/B compared to Nifty 50 and Nifty 500 — a sense of whether you're paying a premium or discount for your holdings."
          state={valuation.status}
          onRetry={valuation.retry}
        >
          {valuation.data && <ValuationSpectrum data={valuation.data} />}
        </SectionCard>
      </div>
    </div>
  );
}
