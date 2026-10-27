import { useState } from "react";
import { formatRupees } from "../../../lib/format";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { CashFlowBars } from "./CashFlowBars";
import { CashFlowStrip } from "./CashFlowStrip";
import { Ledger } from "./Ledger";
import { PeriodDrill } from "./PeriodDrill";
import { SipBanner } from "./SipBanner";
import type { Granularity, LedgerFilter } from "./transactionsLogic";

function TransactionsBody() {
  const money = useMfAnalytics("investment_withdrawal");

  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>("all");

  if (money.status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center"
      >
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">
          Couldn't load your transactions
        </h3>
        <p className="max-w-md text-sm text-[var(--ui-text-muted)]">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => money.retry()}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
      </div>
    );
  }

  const data = money.data;

  const handleTileFilter = (nextFilter: LedgerFilter) => {
    setFilter(nextFilter);
    const target = document.querySelector('[data-testid="card-ledger"]');
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleGranularity = (nextGranularity: Granularity) => {
    setGranularity(nextGranularity);
    setSelectedPeriod(null);
  };

  const shownBuckets = data
    ? granularity === "monthly"
      ? data.monthly
      : data.yearly
    : [];

  const selectedBucket = shownBuckets.find(b => b.period === selectedPeriod) ?? null;

  const hasOpening =
    data?.opening_holdings &&
    data.opening_holdings !== "0" &&
    data.opening_holdings !== "0.00" &&
    data.opening_holdings !== "0.0";

  const hasGifts =
    data?.gifts_net &&
    data.gifts_net !== "0" &&
    data.gifts_net !== "0.00" &&
    data.gifts_net !== "0.0";

  const isGiftsNegative = Boolean(data?.gifts_net && data.gifts_net.trim().startsWith("-"));
  const giftsAmountStr = data?.gifts_net
    ? isGiftsNegative
      ? data.gifts_net.trim().slice(1)
      : data.gifts_net
    : "0";

  return (
    <div data-testid="transactions-cards" className="flex flex-col gap-[18px]">
      {/* Card 1: Cash Flow Over Time */}
      <div data-testid="card-cash-flow">
        <SectionCard
          title="Cash Flow Over Time"
          state={money.status}
          onRetry={money.retry}
        >
          {data && (
            <div className="flex flex-col gap-4">
              <CashFlowStrip
                data={data}
                filter={filter}
                onFilter={handleTileFilter}
              />

              {data.monthly.length === 0 ? (
                <p className="text-xs text-[var(--ui-text-muted)] py-4">
                  No transactions yet
                </p>
              ) : (
                <CashFlowBars
                  buckets={shownBuckets}
                  granularity={granularity}
                  onGranularity={handleGranularity}
                  selectedPeriod={selectedPeriod}
                  onSelect={setSelectedPeriod}
                />
              )}

              {hasOpening && (
                <p data-testid="opening-note" className="text-xs text-[var(--ui-text-muted)]">
                  Opening holdings {formatRupees(data.opening_holdings)} (counted in Total invested above, not drawn as a bar — these units were already held before Unifolio started tracking).
                </p>
              )}

              {hasGifts && (
                <p data-testid="gifts-note" className="text-xs text-[var(--ui-text-muted)]">
                  {isGiftsNegative
                    ? `Gain includes ${formatRupees(giftsAmountStr)} of units given away as gifts.`
                    : `Gain excludes ${formatRupees(data.gifts_net)} of units received as gifts.`}
                </p>
              )}

              <SipBanner summary={data.sip_summary} />

              {selectedBucket && (
                <PeriodDrill key={selectedBucket.period} bucket={selectedBucket} />
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Card 2: All Transactions */}
      <div data-testid="card-ledger">
        <SectionCard
          title="All Transactions"
          state={money.status}
          onRetry={money.retry}
        >
          {data && (
            <Ledger
              buckets={data.monthly}
              filter={filter}
              onFilter={setFilter}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <MutualFundsFrame tab="transactions">
      <TransactionsBody />
    </MutualFundsFrame>
  );
}
