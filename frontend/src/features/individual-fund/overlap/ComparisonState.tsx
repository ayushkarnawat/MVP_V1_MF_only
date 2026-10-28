import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SchemeLogo } from "@/components/SchemeLogo";
import { formatRupees } from "@/lib/format";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import type { FundPageContext } from "../FundPageFrame";
import type { OverlapCompareResponse } from "../types";
import { useFundSection } from "../useFundSection";
import { MarketCapPanel, SectorComparisonPanel } from "./BarPanels";
import { ComparisonOverview } from "./ComparisonOverview";
import { ComparisonTabs } from "./ComparisonTabs";
import { CommonHoldingsPanel, UniqueHoldingsPanel } from "./HoldingsPanels";
import {
  comparisonCaption,
  fundStockTotals,
  keyTakeaway,
  type ComparisonTabId,
} from "./overlapLogic";
import { OverlapDonut } from "./OverlapDonut";
import { PerformancePanel } from "./PerformancePanel";

export interface ComparisonStateProps {
  ctx: FundPageContext;
  otherSchemeId: string;
  onBack: () => void;
}

export function ComparisonState({
  ctx,
  otherSchemeId,
  onBack,
}: ComparisonStateProps) {
  const [tab, setTab] = useState<ComparisonTabId>("overview");
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const compare = useFundSection<OverlapCompareResponse>(
    (signal) =>
      fundPageApi.overlapCompare(ctx.schemeId, otherSchemeId, ctx.scope, signal),
    [ctx.schemeId, otherSchemeId, ctx.scope]
  );

  const totals = compare.data ? fundStockTotals(compare.data.counts) : null;

  return (
    <div data-testid="overlap-comparison" className="space-y-5">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {`Back to ${ctx.summary.scheme.name}'s overlap`}
        </button>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-[var(--ui-text)] outline-none"
        >
          Fund comparison
        </h2>
      </div>

      <SectionState
        status={compare.status}
        label="comparison"
        reason={compare.reason}
        onRetry={compare.retry}
      >
        {compare.data && totals && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 items-center gap-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 md:grid-cols-[1fr,auto,1fr]">
              <div
                data-testid="compare-fund-a"
                className="flex items-center gap-3"
              >
                <SchemeLogo schemeName={compare.data.fund_a.scheme_name} size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--ui-text)] truncate">
                    {compare.data.fund_a.scheme_name}
                  </h3>
                  <p className="text-xs text-[var(--ui-text-muted)]">
                    Current value {formatRupees(compare.data.fund_a.current_value)}
                  </p>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="text-center text-xs font-semibold uppercase text-[var(--ui-text-muted)]"
              >
                vs
              </div>

              <div
                data-testid="compare-fund-b"
                className="flex items-center gap-3"
              >
                <SchemeLogo schemeName={compare.data.fund_b.scheme_name} size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--ui-text)] truncate">
                    {compare.data.fund_b.scheme_name}
                  </h3>
                  <p className="text-xs text-[var(--ui-text-muted)]">
                    Current value {formatRupees(compare.data.fund_b.current_value)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
              <OverlapDonut
                pct={compare.data.overlap_pct}
                label="overlap"
                caption={comparisonCaption(
                  compare.data.counts.common,
                  totals.a,
                  totals.b
                )}
              />
            </div>

            <ComparisonTabs
              selected={tab}
              onSelect={setTab}
              renderPanel={(currentTab) => {
                switch (currentTab) {
                  case "overview":
                    return <ComparisonOverview data={compare.data!} />;
                  case "common":
                    return <CommonHoldingsPanel data={compare.data!} />;
                  case "unique":
                    return <UniqueHoldingsPanel data={compare.data!} />;
                  case "sector":
                    return <SectorComparisonPanel data={compare.data!} />;
                  case "market_cap":
                    return <MarketCapPanel data={compare.data!} />;
                  case "performance":
                    return (
                      <PerformancePanel
                        aId={compare.data!.fund_a.scheme_id}
                        bId={compare.data!.fund_b.scheme_id}
                        aName={compare.data!.fund_a.scheme_name}
                        bName={compare.data!.fund_b.scheme_name}
                      />
                    );
                }
              }}
            />

            <section
              aria-labelledby="key-takeaways-title"
              className="space-y-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
            >
              <h3
                id="key-takeaways-title"
                className="text-base font-semibold text-[var(--ui-text)]"
              >
                Key takeaways
              </h3>
              <p
                data-testid="key-takeaways"
                className="text-xs leading-relaxed text-[var(--ui-text-muted)]"
              >
                {keyTakeaway(compare.data)}
              </p>
            </section>
          </div>
        )}
      </SectionState>
    </div>
  );
}
