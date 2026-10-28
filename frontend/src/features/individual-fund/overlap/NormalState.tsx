import { compareDecimalStrings } from "@/lib/decimal";
import { formatPercent } from "@/lib/format";
import type { OverlapResponse } from "../types";
import { CommonHoldingsTable } from "./CommonHoldingsTable";
import { DistributionBar } from "./DistributionBar";
import { commonStocksCaption, quickInsight } from "./overlapLogic";
import { OverlapDonut } from "./OverlapDonut";
import { SectorOverlap } from "./SectorOverlap";
import { TopOverlapFunds } from "./TopOverlapFunds";

export interface NormalStateProps {
  overlap: OverlapResponse;
  fundName: string;
  onCompare: (schemeId: string) => void;
  restoreFocusId?: string | null;
}

function getCoverageNote(coverage: OverlapResponse["coverage"]): string | null {
  const parts: string[] = [];
  if (coverage.funds_without_disclosure && coverage.funds_without_disclosure.length > 0) {
    const names = coverage.funds_without_disclosure.map((f) => f.scheme_name).join(", ");
    parts.push(`Holdings are not published yet for ${names}, so they are not counted.`);
  }
  if (compareDecimalStrings(coverage.covered_value_pct, "100") === -1) {
    parts.push(
      `Funds with published holdings cover ${formatPercent(coverage.covered_value_pct, { digits: 1 })} of your portfolio's value.`
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export function NormalState({
  overlap,
  fundName,
  onCompare,
  restoreFocusId = null,
}: NormalStateProps) {
  const coverageNote = getCoverageNote(overlap.coverage);

  return (
    <div data-testid="overlap-normal" className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">
          Overlap with Your Portfolio
        </h2>
        <p className="text-sm text-[var(--ui-text-muted)]">
          How much of this fund's holdings are duplicated elsewhere in your portfolio.
        </p>
        {coverageNote && (
          <p data-testid="overlap-coverage" className="text-xs text-[var(--ui-text-muted)] pt-1">
            {coverageNote}
          </p>
        )}
      </div>

      <div className="grid gap-5 min-[1100px]:grid-cols-2">
        <section
          aria-labelledby="overlap-summary-heading"
          className="min-w-0 space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
        >
          <h3 id="overlap-summary-heading" className="text-base font-semibold text-[var(--ui-text)]">
            Overlap Summary
          </h3>
          <OverlapDonut
            pct={overlap.overlap_pct}
            label="overlap with your portfolio"
            caption={commonStocksCaption(overlap.common_stock_count, overlap.total_stock_count)}
          />
          <DistributionBar distribution={overlap.distribution} />
        </section>

        <section
          aria-labelledby="common-sector-heading"
          className="min-w-0 space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
        >
          <h3 id="common-sector-heading" className="text-base font-semibold text-[var(--ui-text)]">
            Common Holdings by Sector
          </h3>
          <p className="text-xs text-[var(--ui-text-muted)]">
            Choose a sector to see which stocks make it up.
          </p>
          <SectorOverlap sectors={overlap.by_sector} />
        </section>

        <div className="min-[1100px]:col-span-2">
          <section
            aria-labelledby="common-holdings-heading"
            className="min-w-0 space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
          >
            <h3 id="common-holdings-heading" className="text-base font-semibold text-[var(--ui-text)]">
              Common Holdings
            </h3>
            <CommonHoldingsTable holdings={overlap.common_holdings} />
          </section>
        </div>

        <section
          aria-labelledby="quick-insights-heading"
          className="min-w-0 space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
        >
          <h3 id="quick-insights-heading" className="text-base font-semibold text-[var(--ui-text)]">
            Quick insights
          </h3>
          <p data-testid="quick-insight" className="text-xs leading-relaxed text-[var(--ui-text-muted)]">
            {quickInsight(overlap)}
          </p>
        </section>

        <section
          aria-labelledby="top-funds-heading"
          className="min-w-0 space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
        >
          <h3 id="top-funds-heading" className="text-base font-semibold text-[var(--ui-text)]">
            Top Funds with Overlap
          </h3>
          <TopOverlapFunds
            funds={overlap.top_overlap_funds}
            fundName={fundName}
            onCompare={onCompare}
            restoreFocusId={restoreFocusId}
          />
        </section>
      </div>
    </div>
  );
}
