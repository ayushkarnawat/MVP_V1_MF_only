import { formatPercent } from "../../../lib/format";
import type { OverlapFund, OverlapPair } from "../../../features/mutual-funds/types";
import {
  type Band,
  type Bands,
  BAND_WORD,
  bandLegendText,
  bandOf,
  pairKey,
  pairKeyOf,
} from "../../../features/mutual-funds/overlap/overlapLogic";

export interface HeatmapPrintProps {
  funds: OverlapFund[];
  pairs: OverlapPair[];
  topPair: OverlapPair | null;
}

const DEFAULT_BANDS: Bands = { low: "20", high: "40" };

const BAND_STYLE: Record<Band, { bg: string; text: string }> = {
  low: { bg: "var(--pos-bg)", text: "var(--pos-text)" },
  moderate: { bg: "var(--warn-bg)", text: "var(--warn-text)" },
  high: { bg: "var(--neg-bg)", text: "var(--neg-text)" },
};

function TopPairCard({ pair }: { pair: OverlapPair }) {
  const band = bandOf(pair.overlap_pct, DEFAULT_BANDS);
  const style = BAND_STYLE[band];
  const stockLabel = pair.common_total === 1 ? "stock" : "stocks";

  return (
    <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-[var(--ui-text)]">
            {pair.fund_a.scheme_name} × {pair.fund_b.scheme_name} — shared holdings
          </h4>
          <p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">
            {formatPercent(pair.overlap_pct, { digits: 2 })} overlap · {pair.common_total} shared {stockLabel}
          </p>
        </div>
        <span
          style={{ backgroundColor: style.bg, color: style.text }}
          className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold"
        >
          {BAND_WORD[band]}
        </span>
      </div>

      {pair.common_total === 0 || pair.common_stocks.length === 0 ? (
        <p className="text-xs text-[var(--ui-text-muted)]">No shared stocks between these two funds.</p>
      ) : (
        <>
          <table className="table-fixed w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ui-divider)]">
                <th
                  scope="col"
                  className="w-[56%] py-2 pr-2 text-left text-[10px] font-medium uppercase tracking-wide text-[var(--ui-text-muted)]"
                >
                  Stock
                </th>
                <th
                  scope="col"
                  className="w-[22%] py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--ui-text-muted)] break-words"
                >
                  {pair.fund_a.scheme_name}
                </th>
                <th
                  scope="col"
                  className="w-[22%] py-2 pl-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--ui-text-muted)] break-words"
                >
                  {pair.fund_b.scheme_name}
                </th>
              </tr>
            </thead>
            <tbody>
              {pair.common_stocks.map(stock => (
                <tr key={stock.isin ?? stock.instrument_name} className="break-inside-avoid border-t border-[var(--ui-divider)]">
                  <td className="py-1.5 pr-2 font-medium text-[var(--ui-text)]">{stock.instrument_name}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--ui-text)]">
                    {formatPercent(stock.weight_a, { digits: 2 })}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-[var(--ui-text)]">
                    {formatPercent(stock.weight_b, { digits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pair.common_total > pair.common_stocks.length && (
            <p className="mt-3 text-xs text-[var(--ui-text-muted)]">
              Showing the largest {pair.common_stocks.length} of {pair.common_total} shared stocks.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function HeatmapPrint({ funds, pairs, topPair }: HeatmapPrintProps) {
  if (funds.length < 2) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="mb-2 text-base font-semibold text-[var(--ui-text)]">Pairwise overlap (%)</h4>
        <p className="text-sm text-[var(--ui-text-muted)]">Overlap needs at least two funds with published holdings.</p>
      </div>
    );
  }

  const pairMap = new Map<string, OverlapPair>();
  for (const p of pairs) {
    pairMap.set(pairKeyOf(p), p);
  }

  const useNumbers = funds.length > 6;
  const cellSizeClass = funds.length > 8 ? "text-[11px]" : "text-xs";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="mb-3 text-base font-semibold text-[var(--ui-text)]">Pairwise overlap (%)</h4>

        <table aria-label="Pairwise overlap (%)" className="table-fixed w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className="w-[28%] py-2 pr-2 text-left" />
              {funds.map((f, i) => (
                <th
                  key={f.scheme_id}
                  scope="col"
                  className={
                    useNumbers
                      ? "py-2 px-1 text-center align-bottom text-xs font-semibold tabular-nums text-[var(--ui-text-muted)]"
                      : "py-2 px-1 text-center align-bottom text-[10px] font-medium uppercase leading-tight tracking-wide text-[var(--ui-text-muted)] break-words"
                  }
                >
                  {useNumbers ? String(i + 1) : f.scheme_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funds.map((rf, rowIndex) => (
              <tr key={rf.scheme_id} className="break-inside-avoid border-t border-[var(--ui-divider)]">
                <th
                  scope="row"
                  className={`py-2 pr-2 text-left font-semibold text-[var(--ui-text)] ${cellSizeClass}`}
                >
                  {useNumbers ? `${rowIndex + 1}  ${rf.scheme_name}` : rf.scheme_name}
                </th>
                {funds.map(cf => {
                  const cellTestId = `print-hm-cell-${rf.scheme_id}-${cf.scheme_id}`;
                  if (rf.scheme_id === cf.scheme_id) {
                    return (
                      <td
                        key={cf.scheme_id}
                        data-testid={cellTestId}
                        className={`h-9 px-1 text-center text-[var(--ui-text-muted)] ${cellSizeClass}`}
                      >
                        –
                      </td>
                    );
                  }

                  const p = pairMap.get(pairKey(rf.scheme_id, cf.scheme_id));
                  if (!p) {
                    return (
                      <td
                        key={cf.scheme_id}
                        data-testid={cellTestId}
                        className={`h-9 px-1 text-center text-[var(--ui-text-muted)] ${cellSizeClass}`}
                      >
                        –
                      </td>
                    );
                  }

                  const band = bandOf(p.overlap_pct, DEFAULT_BANDS);
                  const style = BAND_STYLE[band];

                  return (
                    <td
                      key={cf.scheme_id}
                      data-testid={cellTestId}
                      data-band={band}
                      style={{ backgroundColor: style.bg, color: style.text }}
                      className={`h-9 px-1 text-center font-semibold tabular-nums ${cellSizeClass}`}
                    >
                      {formatPercent(p.overlap_pct, { digits: 0 })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label="Overlap bands" className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--ui-text-muted)]">
          {(["low", "moderate", "high"] as Band[]).map(band => (
            <li key={band} data-testid={`print-hm-legend-${band}`} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: BAND_STYLE[band].text }}
                aria-hidden="true"
              />
              <span>{bandLegendText(band, DEFAULT_BANDS)}</span>
            </li>
          ))}
        </ul>
      </div>

      {topPair && <TopPairCard pair={topPair} />}
    </div>
  );
}
