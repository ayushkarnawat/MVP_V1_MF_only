import { useMemo, useState } from "react";
import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { CommonHoldings } from "./CommonHoldings";
import { Heatmap } from "./Heatmap";
import { ImpactDonut } from "./ImpactDonut";
import { findPair, highestPair, pairKeyOf } from "./overlapLogic";
import { StatStrip } from "./StatStrip";
import { StockConcentration } from "./StockConcentration";
import { TopPairs } from "./TopPairs";

function OverlapBody() {
  const overlap = useMfAnalytics("overlap");
  const stockHoldings = useMfAnalytics("stock_holdings");
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const selectedKey = useMemo(() => {
    if (!overlap.data) return null;
    if (pickedKey && findPair(overlap.data, pickedKey) !== null) {
      return pickedKey;
    }
    const top = highestPair(overlap.data);
    return top ? pairKeyOf(top) : null;
  }, [overlap.data, pickedKey]);

  if (overlap.status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6 text-center space-y-3">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">Couldn't load overlap analysis</h3>
        <p className="text-sm text-[var(--ui-text-muted)]">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={overlap.retry}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--pos-bg)] px-4 py-2 text-xs font-semibold text-[var(--pos-text)] hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  const fewerThanTwoFunds = Boolean(overlap.data && overlap.data.matrix_funds.length < 2);

  return (
    <div data-testid="overlap-cards" className="flex flex-col gap-[18px]">
      <div data-testid="card-stat-strip">
        {overlap.status === "loading" && (
          <div
            role="status"
            aria-label="Loading overlap summary"
            className="h-32 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] animate-pulse"
          />
        )}
        {overlap.status === "failed" && (
          <div role="alert" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex items-center justify-between">
            <p className="text-sm text-[var(--ui-text-muted)]">Couldn't load the overlap summary.</p>
            <button
              type="button"
              data-clickable=""
              data-effect="retry"
              onClick={overlap.retry}
              className="rounded-lg bg-[var(--pos-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--pos-text)] hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}
        {overlap.data && (
          <div className="space-y-4">
            <CoverageBanner
              coverage={overlap.data.coverage}
              excludedShare={overlap.data.excluded_share}
            />
            {!fewerThanTwoFunds && <StatStrip summary={overlap.data} />}
          </div>
        )}
      </div>

      {fewerThanTwoFunds ? (
        <div data-testid="overlap-empty" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6 text-center text-sm text-[var(--ui-text-muted)]">
          Overlap needs at least two funds with published holdings.
        </div>
      ) : (
        <>
          <div data-testid="card-common-holdings">
            <CommonHoldings
              state={stockHoldings.status}
              data={stockHoldings.data}
              onRetry={stockHoldings.retry}
            />
          </div>

          <div data-testid="card-heatmap">
            <Heatmap
              state={overlap.status}
              data={overlap.data}
              onRetry={overlap.retry}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
            />
          </div>

          <div data-testid="card-top-pairs">
            <TopPairs
              state={overlap.status}
              data={overlap.data}
              onRetry={overlap.retry}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
            />
          </div>

          <div data-testid="card-impact">
            <ImpactDonut
              state={overlap.status}
              data={overlap.data}
              onRetry={overlap.retry}
            />
          </div>

          <div data-testid="card-concentration">
            <StockConcentration
              state={overlap.status}
              data={overlap.data}
              onRetry={overlap.retry}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function OverlapPage() {
  return (
    <MutualFundsFrame tab="overlap">
      <OverlapBody />
    </MutualFundsFrame>
  );
}
