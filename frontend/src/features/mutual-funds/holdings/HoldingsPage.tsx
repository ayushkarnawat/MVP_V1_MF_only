import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { AllStocksTable } from "./AllStocksTable";
import { TopHoldingsByFund } from "./TopHoldingsByFund";

function HoldingsBody() {
  const stocks = useMfAnalytics("stock_holdings");

  if (stocks.status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center"
      >
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">
          Couldn't load your holdings data
        </h3>
        <p className="max-w-md text-sm text-[var(--ui-text-muted)]">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => stocks.retry()}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="holdings-cards" className="flex flex-col gap-[18px]">
      <div data-testid="card-top-holdings">
        <TopHoldingsByFund
          state={stocks.status}
          data={stocks.data}
          onRetry={stocks.retry}
        />
      </div>
      <div id="all-holdings" data-testid="card-all-stocks">
        <AllStocksTable
          state={stocks.status}
          data={stocks.data}
          onRetry={stocks.retry}
        />
      </div>
    </div>
  );
}

export default function HoldingsPage() {
  return (
    <MutualFundsFrame tab="holdings">
      <HoldingsBody />
    </MutualFundsFrame>
  );
}
