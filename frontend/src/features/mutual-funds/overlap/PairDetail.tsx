import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { formatPercent } from "../../../lib/format";
import { FundLink } from "../common/FundLink";
import type { OverlapPair } from "../types";
import { type Band, BAND_WORD, fundInitials } from "./overlapLogic";

export interface PairDetailProps {
  pair: OverlapPair;
  band: Band;
}

export function PairDetail({ pair, band }: PairDetailProps) {
  const a = pair.fund_a.scheme_name;
  const b = pair.fund_b.scheme_name;
  const initA = fundInitials(a);
  const initB = fundInitials(b);

  const stockLabel = pair.common_total === 1 ? "stock" : "stocks";

  const bandBg =
    band === "low"
      ? "var(--pos-bg)"
      : band === "moderate"
        ? "var(--warn-bg)"
        : "var(--neg-bg)";
  const bandText =
    band === "low"
      ? "var(--pos-text)"
      : band === "moderate"
        ? "var(--warn-text)"
        : "var(--neg-text)";

  return (
    <section
      data-testid="pair-detail"
      aria-label={`${a} × ${b} shared holdings`}
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 space-y-3 min-w-[280px] max-w-sm shrink-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[var(--ui-text)]">
            <FundLink schemeId={pair.fund_a.scheme_id}>{a}</FundLink> × <FundLink schemeId={pair.fund_b.scheme_id}>{b}</FundLink> — shared holdings
          </h4>
          <span data-testid="pair-detail-summary" className="text-xs text-[var(--ui-text-muted)] block mt-0.5">
            {formatPercent(pair.overlap_pct, { digits: 2 })} overlap · {pair.common_total} shared {stockLabel}
          </span>
        </div>
        <span
          data-testid="pair-detail-band"
          data-band={band}
          style={{ backgroundColor: bandBg, color: bandText }}
          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold shrink-0"
        >
          {BAND_WORD[band]}
        </span>
      </div>

      {pair.common_total === 0 ? (
        <p data-testid="pair-detail-none" className="text-xs text-[var(--ui-text-muted)]">
          No shared stocks between these two funds.
        </p>
      ) : (
        <>
          <ul aria-label="Shared stocks" className="divide-y divide-[var(--ui-divider)] max-h-80 overflow-y-auto">
            {pair.common_stocks.map(stock => (
              <li
                key={stock.isin}
                data-testid={`shared-${stock.isin}`}
                className="py-2 first:pt-0 last:pb-0"
              >
                <p className="text-xs font-medium text-[var(--ui-text)] truncate">{stock.instrument_name}</p>
                <p className="text-[11px] text-[var(--ui-text-muted)] mt-0.5">
                  {initA} {formatLookthroughPercent(stock.weight_a)}% · {initB} {formatLookthroughPercent(stock.weight_b)}%
                </p>
              </li>
            ))}
          </ul>
          {pair.common_total > pair.common_stocks.length && (
            <p data-testid="pair-detail-limit" className="text-xs text-[var(--ui-text-muted)] pt-1">
              Showing the largest {pair.common_stocks.length} of {pair.common_total} shared stocks.
            </p>
          )}
        </>
      )}
    </section>
  );
}
