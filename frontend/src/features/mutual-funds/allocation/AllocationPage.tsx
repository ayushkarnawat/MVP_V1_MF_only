import { useMemo } from "react";
import { useMfAnalytics } from "../data/analyticsStore";
import { useMfHoldings } from "../data/useMfDashboard";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { AssetClassCard } from "./AssetClassCard";
import { CategoryAmcCard } from "./CategoryAmcCard";
import { FundManagerCard } from "./FundManagerCard";
import { MarketCapCard } from "./MarketCapCard";

function AllocationBody() {
  const asset = useMfAnalytics("asset_allocation");
  const cap = useMfAnalytics("cap_allocation");
  const alloc = useMfAnalytics("allocation");
  const manager = useMfAnalytics("fund_manager");
  const benchmarkFunds = useMfAnalytics("benchmark_funds");
  const { holdings } = useMfHoldings();

  const allErrored =
    asset.status === "error" &&
    cap.status === "error" &&
    alloc.status === "error" &&
    manager.status === "error";

  const xirrByScheme = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    if (benchmarkFunds.data?.funds) {
      for (const fund of benchmarkFunds.data.funds) {
        map[fund.scheme_id] = fund.fund_xirr;
      }
    }
    return map;
  }, [benchmarkFunds.data]);

  if (allErrored) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center"
      >
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">
          Couldn't load your allocation data
        </h3>
        <p className="max-w-md text-sm text-[var(--ui-text-muted)]">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => asset.retry()}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="allocation-cards" className="flex flex-col gap-[18px]">
      <div id="asset-allocation" data-testid="card-asset-class">
        <AssetClassCard
          state={asset.status}
          data={asset.data}
          onRetry={asset.retry}
        />
      </div>
      <div id="market-cap" data-testid="card-market-cap">
        <MarketCapCard
          state={cap.status}
          data={cap.data}
          onRetry={cap.retry}
        />
      </div>
      <div data-testid="card-category-amc">
        <CategoryAmcCard
          state={alloc.status}
          data={alloc.data}
          onRetry={alloc.retry}
          holdings={holdings}
        />
      </div>
      <div data-testid="card-fund-manager">
        <FundManagerCard
          state={manager.status}
          data={manager.data}
          onRetry={manager.retry}
          xirrByScheme={xirrByScheme}
        />
      </div>
    </div>
  );
}

export default function AllocationPage() {
  return (
    <MutualFundsFrame tab="allocation">
      <AllocationBody />
    </MutualFundsFrame>
  );
}
