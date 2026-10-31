import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { CategoryTabs } from "./CategoryTabs";
import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { CommonHoldings } from "./CommonHoldings";
import { Heatmap } from "./Heatmap";
import { ImpactDonut } from "./ImpactDonut";
import { equityStockHoldings, findPair, highestPair, pairKeyOf } from "./overlapLogic";
import { StatStrip } from "./StatStrip";
import { StockConcentration } from "./StockConcentration";
import { TopPairs } from "./TopPairs";

function OverlapBody() {
  const overlap = useMfAnalytics("overlap");
  const stockHoldings = useMfAnalytics("stock_holdings");
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "category">("all");
  const [category, setCategory] = useState<string | null>(null);
  const categories = overlap.data?.by_category;
  const hasCategories = Boolean(categories && Object.keys(categories).length);
  const categoryView = view === "category" && hasCategories;
  const selectedData = categoryView && category ? categories?.[category] ?? overlap.data : overlap.data;
  const categoryCards = categoryView && !category;
  const commonData = equityStockHoldings(stockHoldings.data, selectedData);
  const chooseCategory = (next: string) => { setCategory(next); setPickedKey(null); };

  const selectedKey = useMemo(() => {
    if (!selectedData) return null;
    if (pickedKey && findPair(selectedData, pickedKey) !== null) {
      return pickedKey;
    }
    const top = highestPair(selectedData);
    return top ? pairKeyOf(top) : null;
  }, [selectedData, pickedKey]);

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

  const fewerThanTwoFunds = Boolean(selectedData && selectedData.matrix_funds.length < 2);

  return (
    <div className="space-y-4">
      {overlap.data && <div role="tablist" aria-label="Overlap views" className="flex gap-2">
        <Button type="button" role="tab" aria-selected={!categoryView} variant={!categoryView ? "default" : "ghost"}
          data-clickable="" data-effect="select" onClick={() => setView("all")}>All funds</Button>
        {hasCategories && <Button type="button" role="tab" aria-selected={categoryView} variant={categoryView ? "default" : "ghost"}
          data-clickable="" data-effect="select" onClick={() => setView("category")}>By category</Button>}
      </div>}
      {categoryView && <CategoryTabs categories={Object.keys(categories!)} value={category} onChange={chooseCategory} />}
      {categoryCards && <div aria-label="Category cards" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(categories!).map(([name, data]) => {
          const count = data.total_fund_count;
          const countText = count === 0 ? "no funds" : `${count} ${count === 1 ? "fund" : "funds"}`;
          return <button key={name} type="button" aria-label={`${name}: ${countText}`} disabled={count === 0}
            data-clickable="" data-effect="select" onClick={() => chooseCategory(name)}
            className={`rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 text-left ${count < 2 ? "opacity-60" : "hover:bg-[var(--ui-row-hover)]"}`}>
            <span className="block font-semibold text-[var(--ui-text)]">{name}</span>
            <span className="text-sm text-[var(--ui-text-muted)]">{countText}</span>
          </button>;
        })}
      </div>}
      {Boolean(overlap.data?.excluded_funds?.length) && <aside role="note" aria-label="Funds not shown" className="rounded-xl border border-[var(--ui-divider)] p-4 text-xs text-[var(--ui-text-muted)]">
        <p className="mb-2 font-semibold">Funds not shown</p>
        <ul className="space-y-2">{overlap.data!.excluded_funds!.map((fund, index) => <li key={`${fund.name}-${index}`} className="flex items-start gap-2">
          <SchemeLogo schemeName={fund.name} size="sm" /><span>{fund.name}: {fund.reason}</span>
        </li>)}</ul>
      </aside>}
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
            {!fewerThanTwoFunds && !categoryCards && selectedData && <StatStrip summary={selectedData} />}
          </div>
        )}
      </div>

      {categoryCards ? null : fewerThanTwoFunds ? (
        <div data-testid="overlap-empty" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6 text-center text-sm text-[var(--ui-text-muted)]">
          <p>{selectedData?.total_fund_count === 0
            ? categoryView ? "No funds in this category." : "No equity funds to compare."
            : "Overlap needs at least two funds with published holdings."}</p>
          {categoryView && <Button type="button" size="sm" className="mt-3" data-clickable="" data-effect="navigate" onClick={() => setView("all")}>Back to All funds</Button>}
        </div>
      ) : (
        <>
          <div data-testid="card-common-holdings">
            <CommonHoldings
              state={stockHoldings.status}
              data={commonData}
              onRetry={stockHoldings.retry}
            />
          </div>

          <div data-testid="card-heatmap">
            <Heatmap
              state={overlap.status}
              data={selectedData}
              onRetry={overlap.retry}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
            />
          </div>

          <div data-testid="card-top-pairs">
            <TopPairs
              state={overlap.status}
              data={selectedData}
              onRetry={overlap.retry}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
            />
          </div>

          <div data-testid="card-impact">
            <ImpactDonut
              state={overlap.status}
              data={selectedData}
              onRetry={overlap.retry}
            />
          </div>

          <div data-testid="card-concentration">
            <StockConcentration
              state={overlap.status}
              data={selectedData}
              onRetry={overlap.retry}
            />
          </div>
        </>
      )}
    </div>
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
