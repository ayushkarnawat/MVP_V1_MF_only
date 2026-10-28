import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { CoverageBanner, fundAgeText } from "../../../components/mf/CoverageBanner";
import { formatPercent as lookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { formatPercent } from "../../../lib/format";
import { AppLink } from "../../../shell/nav/AppLink";
import { paths } from "../../../shell/nav/paths";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { FundLink } from "../common/FundLink";
import { SectionCard } from "../common/SectionCard";
import type { StockHoldingsSummary } from "../types";
import {
  equityRows,
  heldInText,
  portfolioShare,
  sortStocks,
  STOCK_SORTS,
  type StockSort,
  stockKey,
} from "./holdingsLogic";

export function AllStocksTable({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<StockHoldingsSummary>) {
  const [sort, setSort] = useState<StockSort>("weight");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rawRows = useMemo(() => equityRows(data), [data]);
  const sortedRows = useMemo(() => sortStocks(rawRows, sort), [rawRows, sort]);

  const activeOpenKey =
    openKey && sortedRows.some(r => stockKey(r) === openKey) ? openKey : null;

  return (
    <SectionCard
      title="All Holdings Across Your Portfolio"
      info="Every distinct stock your funds hold, looked through to the underlying company — the same stock can appear in several funds and is counted once here, at its combined weight."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="flex flex-col gap-4">
          {/* Sort stocks controls */}
          <div
            role="group"
            aria-label="Sort stocks"
            className="inline-flex self-start rounded-lg border border-[var(--ui-divider)] p-0.5"
          >
            {STOCK_SORTS.map(s => {
              const isPressed = sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={isPressed}
                  data-clickable=""
                  data-effect="sort"
                  onClick={() => setSort(s.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    isPressed
                      ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                      : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-[var(--ui-text-muted)]">
            Click a stock to see exactly which of your funds hold it, and at what weight within each fund.
          </p>

          <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />

          {sortedRows.length === 0 ? (
            <p className="text-xs text-[var(--ui-text-muted)]">
              No equity stocks disclosed for this selection
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label="All stock holdings"
                className="w-full text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                    <th className="pb-2 font-medium w-12">#</th>
                    <th className="pb-2 font-medium">Stock</th>
                    <th className="pb-2 font-medium">Portfolio weight</th>
                    <th className="pb-2 font-medium">Held in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ui-divider)]">
                  {sortedRows.map((row, index) => {
                    const key = stockKey(row);
                    const isOpen = activeOpenKey === key;

                    return (
                      <tr
                        key={key}
                        data-testid={`stock-row-${key}`}
                        className="group"
                      >
                        <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">
                          {index + 1}
                        </td>
                        <th scope="row" className="py-2.5 font-normal text-[var(--ui-text)]">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            data-clickable=""
                            data-effect="expand"
                            onClick={() => setOpenKey(isOpen ? null : key)}
                            className="flex items-center gap-1.5 text-left font-medium hover:text-[var(--pos-text)]"
                          >
                            <ChevronRight
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            />
                            <span>{row.instrument_name}</span>
                          </button>
                          {row.sector_raw && (
                            <span className="block text-[11px] text-[var(--ui-text-muted)] pl-5">
                              {row.sector_raw}
                            </span>
                          )}
                        </th>
                        <td className="py-2.5 font-medium text-[var(--ui-text)]">
                          {formatPercent(row.exposure_pct, { digits: 2 })}
                        </td>
                        <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">
                          {heldInText(row)}
                        </td>
                      </tr>
                    );
                  }).flatMap((el, idx) => {
                    const row = sortedRows[idx];
                    const key = stockKey(row);
                    const isOpen = activeOpenKey === key;

                    if (!isOpen) return [el];

                    const detailRow = (
                      <tr
                        key={`detail-${key}`}
                        data-testid={`stock-detail-${key}`}
                        className="bg-[var(--ui-card)]"
                      >
                        <td colSpan={4} className="p-3">
                          <ul
                            aria-label={`Funds holding ${row.instrument_name}`}
                            className="flex flex-col gap-1.5 text-xs text-[var(--ui-text-muted)]"
                          >
                            {row.contributing_funds.map(fund => {
                              const age = fundAgeText(fund);
                              const prod = portfolioShare(
                                fund.fund_weight_pct,
                                fund.stock_weight_pct
                              );
                              return (
                                <li
                                  key={fund.scheme_id}
                                  data-testid={`stock-fund-${key}-${fund.scheme_id}`}
                                >
                                  <FundLink schemeId={fund.scheme_id}>{fund.scheme_name}</FundLink> · {lookthroughPercent(fund.stock_weight_pct)}% of fund ·{" "}
                                  {lookthroughPercent(prod)}% of portfolio
                                  {age ? ` · ${age}` : ""}
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    );

                    return [el, detailRow];
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom count and link */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[var(--ui-divider)] text-xs">
            <p data-testid="stock-count" className="text-[var(--ui-text-muted)]">
              {data.truncated
                ? `Showing the largest ${sortedRows.length} of ${data.total_stock_count} distinct stocks held across your funds.`
                : `${data.total_stock_count} distinct stocks held across your funds.`}
            </p>

            <AppLink
              to={paths.mutualFunds.allocation()}
              className="text-[var(--pos-text)] hover:underline self-start font-medium"
            >
              {formatPercent(data.non_equity_share, { digits: 1 })} in non-equity positions — debt, gold, cash and other holdings
            </AppLink>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
