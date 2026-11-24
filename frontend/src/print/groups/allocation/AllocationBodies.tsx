import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { formatPercent as lookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { ASSET_LABELS, CAP_LABELS, assetSlices, bucketSlices, classFunds, hasNegative, largestSlice } from "../../../features/mutual-funds/allocation/allocationLogic";
import type { AssetAllocationSummary, AssetClassKey, AnalyticsAllocationSummary, CapAllocationSummary, Slice } from "../../../features/mutual-funds/types";
import { compareDecimalStrings, diffDecimalStrings } from "../../../lib/decimal";
import { formatCompactRupees, formatPercent, formatRupees } from "../../../lib/format";
import { DonutLegendPrint } from "../shared/DonutLegendPrint";

function legendSlices(slices: Slice[]) {
  return slices.map(slice => ({ key: slice.key, label: slice.label, value: slice.value, percent: slice.pct }));
}

export function AssetClassPrint({ data }: { data: AssetAllocationSummary }) {
  const variant = data.as_disclosed;
  if (!["equity", "debt", "gold", "real_estate", "others"].every(key => variant.classes.some(item => item.key === key))) {
    return <p role="status" className="text-xs text-[var(--ui-text-muted)]">Asset allocation is updating.</p>;
  }
  if (compareDecimalStrings(data.covered_value, "0") === 0) return <p className="text-xs text-[var(--ui-text-muted)]">No look-through asset allocation data available</p>;
  const slices = assetSlices(variant).filter(slice => slice.key !== "others" || compareDecimalStrings(slice.pct, "0") > 0);
  const largest = largestSlice(slices);
  return <div className="space-y-4">
    <p className="text-xs text-[var(--ui-text-muted)]">Percentages describe the five asset classes in your published fund holdings.</p>
    <p className="text-xs text-[var(--ui-text-muted)]">Cash is included under Debt</p>
    <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
    <DonutLegendPrint slices={legendSlices(slices)} centreLabel="Covered value" centreValue={formatCompactRupees(data.covered_value)} />
    {!data.hide_headlines && largest && <p className="text-xs font-medium text-[var(--ui-text)]">Largest asset class: {largest.label} ({formatPercent(largest.pct, { digits: 1 })})</p>}
    {hasNegative(slices) && <p className="text-xs text-[var(--ui-text-muted)]">Negative net positions are listed with their signed percentages; the donut shows positive exposures.</p>}
    {data.arbitrage_funds.length > 0 && <p data-testid="arbitrage-print-note" className="text-xs text-[var(--ui-text-muted)]">
      {`If arbitrage funds were treated as cash-like: ${data.arbitrage_as_cash.classes.map(item => `${ASSET_LABELS[item.key]} ${formatPercent(item.percentage, { digits: 1 })}`).join(" · ")}; Equity by size: ${data.arbitrage_as_cash.equity_outer.map(item => `${CAP_LABELS[item.key]} ${formatPercent(item.percentage, { digits: 1 })}`).join(" · ")}; applies to ${data.arbitrage_funds.map(fund => fund.scheme_name).join(", ")}, with the entire fund value moved to Debt and Equity Savings unchanged.`}
    </p>}
    {slices.map(slice => {
      const funds = classFunds(variant, slice.key as AssetClassKey);
      return <div key={slice.key} className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--ui-text)]">{slice.label}</h4>
        <p className="text-xs font-semibold text-[var(--ui-text)]">Contributing funds</p>
        {funds === null ? <p className="text-xs text-[var(--ui-text-muted)]">A fund-by-fund breakdown isn't available for this class yet; the look-through produces one total for it.</p>
          : funds.length === 0 ? <p className="text-xs text-[var(--ui-text-muted)]">No fund adds a positive amount to this class.</p>
            : <ul data-testid={`asset-funds-${slice.key}`} className="space-y-1 text-xs">
              {funds.map(fund => <li key={fund.scheme_id} className="flex justify-between gap-3 rounded-lg border border-[var(--ui-divider)] px-3 py-2">
                <span className="text-[var(--ui-text)]">{fund.scheme_name}</span>
                <span className="text-[var(--ui-text-muted)]">{formatRupees(fund.value)} · {formatPercent(fund.percentage, { digits: 1 })} of {slice.label}</span>
              </li>)}
            </ul>}
      </div>;
    })}
  </div>;
}

export function MarketCapPrint({ data }: { data: CapAllocationSummary }) {
  const hasClassifiedFields = Boolean(data.unclassified_share_pct) && data.buckets.every(bucket => typeof bucket.percentage_classified === "string" && bucket.percentage_classified !== "");
  if (!hasClassifiedFields) return <p role="status" className="text-xs text-[var(--ui-text-muted)]">Market-cap allocation is updating.</p>;
  const slices = data.buckets.filter(bucket => bucket.key !== "OTHER").map(bucket => ({ key: bucket.key.toLowerCase(), label: CAP_LABELS[bucket.key], value: bucket.value, percent: bucket.percentage_classified! }));
  const hasEquity = slices.some(slice => compareDecimalStrings(slice.percent, "0") > 0);
  const unclassified = data.unclassified_share_pct || "0";
  const notePercent = (value: string) => lookthroughPercent(value).replace(/\.?0+$/, "");
  const noHoldings = compareDecimalStrings(data.total_portfolio_value, "0") === 0;
  const summarySlices: Slice[] = slices.map((slice, index) => ({ ...slice, pct: slice.percent, color: `var(--c${index + 1})` }));
  const largest = largestSlice(summarySlices);
  return <div className="space-y-4">
    {!data.classification_as_of && <p className="text-xs text-[var(--ui-text-muted)]">No applicable AMFI classifications for these holdings.</p>}
    <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
    {compareDecimalStrings(unclassified, "0.5") >= 0 && <p className="text-xs text-[var(--ui-text-muted)]">
      {notePercent(unclassified)}% of your equity could not be sorted into Large, Mid or Small (for example overseas stocks), so the three slices describe the other {notePercent(diffDecimalStrings("100", unclassified))}%.
    </p>}
    {noHoldings ? <p className="text-xs text-[var(--ui-text-muted)]">No holdings for this selection</p>
      : !hasEquity ? <p className="text-xs text-[var(--ui-text-muted)]">Not enough classified equity</p>
        : <DonutLegendPrint slices={slices} centreLabel="Total portfolio" centreValue={formatCompactRupees(data.total_portfolio_value)} />}
    {!data.hide_headlines && hasEquity && !noHoldings && largest && <p className="text-xs font-medium text-[var(--ui-text)]">Largest allocation: {largest.label} ({formatPercent(largest.pct, { digits: 1 })})</p>}
    {hasNegative(summarySlices) && <p className="text-xs text-[var(--ui-text-muted)]">Negative net positions are listed with their signed percentages; the donut shows positive exposures.</p>}
    {data.buckets.map(bucket => <div key={bucket.key} className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--ui-text)]">{CAP_LABELS[bucket.key]}</h4>
      <table data-testid={`cap-stocks-${bucket.key}`} className="w-full table-fixed text-left text-xs">
        <thead><tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]"><th scope="col" className="py-2 font-medium">Stock</th><th scope="col" className="py-2 text-right font-medium">Current value</th></tr></thead>
        <tbody>{bucket.rows.map((row, index) => <tr key={`${row.isin ?? row.instrument_name}-${index}`} className="border-b border-[var(--ui-divider)]">
          <th scope="row" className="py-2 font-normal text-[var(--ui-text)]">{row.instrument_name}</th><td className="py-2 text-right text-[var(--ui-text-muted)]">{formatRupees(row.exposure_value)}</td>
        </tr>)}</tbody>
      </table>
      {bucket.rows.length === 0 && <p className="text-xs text-[var(--ui-text-muted)]">No holdings in this group</p>}
      {bucket.row_count > bucket.rows.length && <p className="text-xs text-[var(--ui-text-muted)]">Showing the largest {bucket.rows.length} of {bucket.row_count} holdings in this group.</p>}
    </div>)}
  </div>;
}

export function CategoryAmcPrint({ data }: { data: AnalyticsAllocationSummary }) {
  return <div className="space-y-6">
    <p className="text-xs text-[var(--ui-text-muted)]">Asset distribution across SEBI categories and fund houses.</p>
    {(["category", "amc"] as const).map(kind => {
      const slices = bucketSlices(kind === "category" ? data.by_category : data.by_amc, "desc");
      return <div key={kind} data-testid={`allocation-${kind}-print`} className="space-y-3">
        <h4 className="text-sm font-semibold text-[var(--ui-text)]">{kind === "category" ? "By Category" : "By AMC"}</h4>
        {slices.length === 0 ? <p className="text-xs text-[var(--ui-text-muted)]">No allocation data available for this selection</p>
          : slices.length <= 9 ? <DonutLegendPrint slices={legendSlices(slices)} centreLabel="Total" centreValue={formatCompactRupees(data.total_value)} />
            : <table className="w-full table-fixed text-left text-xs">
              <thead><tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                <th scope="col" className="py-2 font-medium">{kind === "category" ? "By Category" : "By AMC"}</th><th scope="col" className="py-2 text-right font-medium">% of overall portfolio</th><th scope="col" className="py-2 text-right font-medium">Current value</th>
              </tr></thead>
              <tbody>{slices.map(slice => <tr key={slice.key} className="border-b border-[var(--ui-divider)]">
                <th scope="row" className="py-2 font-normal text-[var(--ui-text)]">{slice.label}</th>
                <td className="py-2 text-right text-[var(--ui-text-muted)]">{formatPercent(slice.pct, { digits: 1 })}</td>
                <td className="py-2 text-right text-[var(--ui-text)]">{formatRupees(slice.value)}</td>
              </tr>)}</tbody>
            </table>}
      </div>;
    })}
  </div>;
}
