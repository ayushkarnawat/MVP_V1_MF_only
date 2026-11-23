import { useMemo } from "react";
import { PageSearch } from "../../../components/search/PageSearch";
import { usePageSearchState } from "../../../components/search/usePageSearchState";
import { Button } from "../../../components/ui/button";
import { useScope } from "../../../shell/scope/ScopeContext";
import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { AllStocksTable } from "./AllStocksTable";
import { equityRows } from "./holdingsLogic";
import { filterStockRows } from "./stockSearch";
import { TopHoldingsByFund } from "./TopHoldingsByFund";

const NO_CHIPS: Array<"period" | "member" | "category"> = [];

function HoldingsBody({
  stocks,
  query,
}: {
  stocks: ReturnType<typeof useMfAnalytics<"stock_holdings">>;
  query: string;
}) {

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
        <Button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => stocks.retry()}
          className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-95"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="holdings-cards" className="flex flex-col gap-[18px]">
      <div data-testid="card-top-holdings">
        <TopHoldingsByFund
          anchor="holdings-top-by-fund"
          state={stocks.status}
          data={stocks.data}
          onRetry={stocks.retry}
        />
      </div>
      <div id="all-holdings" data-testid="card-all-stocks">
        <AllStocksTable
          anchor="holdings-all-stocks"
          state={stocks.status}
          data={stocks.data}
          onRetry={stocks.retry}
          query={query}
        />
      </div>
    </div>
  );
}

export default function HoldingsPage() {
  const { text } = usePageSearchState("holdings");
  const { userId } = useScope();
  const stocks = useMfAnalytics("stock_holdings");
  const allRows = useMemo(() => equityRows(stocks.data), [stocks.data]);
  const matchedRows = useMemo(
    () => filterStockRows(allRows, text),
    [allRows, text],
  );

  return (
    <MutualFundsFrame
      tab="holdings"
      utility={
        <PageSearch
          pageKey="holdings"
          noun="stocks"
          chipsAllowed={NO_CHIPS}
          total={allRows.length}
          matched={matchedRows.length}
          userId={userId ?? null}
        />
      }
    >
      <HoldingsBody stocks={stocks} query={text} />
    </MutualFundsFrame>
  );
}
