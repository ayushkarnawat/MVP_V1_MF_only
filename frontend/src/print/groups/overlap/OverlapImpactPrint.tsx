import type { OverlapSummary } from "../../../features/mutual-funds/types";
import { impactBreakdown, impactPairs, pairKey } from "../../../features/mutual-funds/overlap/overlapLogic";
import { formatPercent, formatRupees } from "../../../lib/format";
import { DonutLegendPrint } from "../shared/DonutLegendPrint";

export function OverlapImpactPrint({ data }: { data: OverlapSummary }) {
  const count = Math.min(3, data.pairs_above_low.length);
  const rows = impactBreakdown(data);
  const drivers = impactPairs(data);
  const headline = count === 1
    ? `${formatPercent(rows[0].pct, { digits: 1 })} of portfolio in top overlapping pair`
    : `${formatPercent(rows[0].pct, { digits: 1 })} of portfolio in top ${count} overlapping pairs`;
  return <div className="space-y-4">
    <p className="text-xs text-[var(--ui-text-muted)]">How much of your portfolio sits in overlapping vs. unique holdings.</p>
    {count === 0 ? <p data-testid="impact-empty" className="text-sm text-[var(--ui-text-muted)]">No fund pairs overlap above the low band, so none of your portfolio sits in overlapping funds.</p>
      : <>
        <p data-testid="impact-headline" className="text-sm font-semibold text-[var(--ui-text)]">{headline}</p>
        <DonutLegendPrint slices={rows.map(row => ({ key: row.key, label: row.label, value: row.value, percent: row.pct }))} centreLabel="Portfolio" centreValue={formatRupees(data.total_portfolio_value)} />
      </>}
    {drivers.length > 0 && <section data-testid="impact-drivers" aria-label="What drives the overlap" className="space-y-3 border-t border-[var(--ui-divider)] pt-4">
      <h4 className="text-sm font-semibold text-[var(--ui-text)]">What drives the overlap</h4>
      <p className="text-xs text-[var(--ui-text-muted)]">The biggest shared stocks behind your top overlapping pairs.</p>
      {drivers.map(pair => {
        const key = pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id);
        const title = `${pair.fund_a.scheme_name} × ${pair.fund_b.scheme_name}`;
        return <div key={key} data-testid={`impact-pair-${key}`} className="space-y-1.5">
          <div className="flex flex-wrap justify-between gap-2">
            <h5 className="text-xs font-semibold text-[var(--ui-text)]">{title}</h5>
            <span className="text-xs text-[var(--ui-text-muted)]">{formatPercent(pair.overlap_pct, { digits: 0 })} overlap</span>
          </div>
          <ul aria-label={`Stocks driving ${title}`} className="space-y-1 text-xs">
            {pair.drivers.map(stock => <li key={stock.isin} className="flex justify-between gap-3 rounded-lg border border-[var(--ui-divider)] px-3 py-2">
              <span className="text-[var(--ui-text)]">{stock.instrument_name}</span>
              <span className="text-[var(--ui-text-muted)]">{formatPercent(stock.contribution_pct, { digits: 2 })} of net assets · {formatPercent(stock.share_of_pair_pct, { digits: 1 })} of the overlap</span>
            </li>)}
          </ul>
        </div>;
      })}
    </section>}
  </div>;
}
