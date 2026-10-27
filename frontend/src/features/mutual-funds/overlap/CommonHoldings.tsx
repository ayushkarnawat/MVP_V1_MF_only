import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { formatPercent } from "../../../lib/format";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import type { StockHoldingsSummary } from "../types";
import {
  barWidth,
  COMMON_LIMIT,
  commonStocks,
  fundInitials,
} from "./overlapLogic";

export function CommonHoldings({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<StockHoldingsSummary>) {
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const common = commonStocks(data);
  const largest = common.length > 0 ? common[0].row.exposure_pct : "0";
  const displayed = showAll ? common : common.slice(0, COMMON_LIMIT);

  // If an open stock is hidden by Show fewer, forget it
  if (openKey !== null && !displayed.some(s => s.key === openKey)) {
    setOpenKey(null);
  }

  return (
    <SectionCard
      title="1. Common Holdings"
      info="Stocks held by more than one of your funds, and how much of your total portfolio they represent combined."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--ui-text-muted)]">
            Click a stock to see exactly how much of each fund it's held in.
          </p>

          {data.truncated && (
            <p data-testid="common-truncated" className="text-xs text-[var(--ui-text-muted)]">
              Found among the largest {data.rows.length} of {data.total_stock_count} stocks your funds hold.
            </p>
          )}

          {common.length === 0 ? (
            <p data-testid="common-empty" className="text-sm text-[var(--ui-text-muted)]">
              No stocks are held by more than one of your funds.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table aria-label="Common holdings" className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
                      <th scope="col" className="py-2.5 pl-2 pr-3 font-medium">
                        #
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Stock
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Held in
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Total Portfolio Exposure
                      </th>
                      <th scope="col" className="py-2.5 pl-3 pr-2 font-medium">
                        Top Funds
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((item, index) => {
                      const isOpen = openKey === item.key;
                      const extraFunds = item.funds.slice(3);
                      return (
                        <tr
                          key={item.key}
                          data-testid={`common-row-${item.key}`}
                          className="border-b border-[var(--ui-divider)] transition-colors hover:bg-[var(--ui-row-hover)]"
                        >
                          <td className="py-3 pl-2 pr-3 text-xs text-[var(--ui-text-muted)]">
                            {index + 1}
                          </td>
                          <th scope="row" className="py-3 px-3 font-normal text-[var(--ui-text)]">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              data-testid={`common-toggle-${item.key}`}
                              data-clickable=""
                              data-effect="expand"
                              onClick={() => setOpenKey(isOpen ? null : item.key)}
                              className="inline-flex items-center gap-2 text-left font-medium text-[var(--ui-text)] hover:text-[var(--ui-text)]"
                            >
                              <ChevronRight
                                className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                              />
                              <span>{item.row.instrument_name}</span>
                            </button>
                          </th>
                          <td className="py-3 px-3 text-xs text-[var(--ui-text-muted)]">
                            {item.funds.length} funds
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span data-testid={`common-exposure-${item.key}`} className="text-xs font-medium text-[var(--ui-text)]">
                                {formatPercent(item.row.exposure_pct, { digits: 2 })}
                              </span>
                              <div className="h-1.5 w-24 rounded-full bg-[var(--ui-divider)] overflow-hidden">
                                <span
                                  data-testid={`common-bar-${item.key}`}
                                  style={{ width: `${barWidth(item.row.exposure_pct, largest)}%` }}
                                  className="block h-full bg-[var(--c1)]"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pl-3 pr-2">
                            <div className="flex items-center gap-1.5">
                              {item.funds.slice(0, 3).map(f => (
                                <span
                                  key={f.scheme_id}
                                  data-testid={`chip-${item.key}-${f.scheme_id}`}
                                  title={f.scheme_name}
                                  data-tooltip={f.scheme_name}
                                  tabIndex={0}
                                  className="inline-flex items-center justify-center rounded-md bg-[var(--ui-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-text)] border border-[var(--ui-divider)]"
                                >
                                  {fundInitials(f.scheme_name)}
                                </span>
                              ))}
                              {extraFunds.length > 0 && (
                                <span
                                  data-testid={`chip-more-${item.key}`}
                                  title={`Also held in: ${extraFunds.map(f => f.scheme_name).join(", ")}`}
                                  data-tooltip={`Also held in: ${extraFunds.map(f => f.scheme_name).join(", ")}`}
                                  tabIndex={0}
                                  className="inline-flex items-center justify-center rounded-md bg-[var(--ui-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-text-muted)] border border-[var(--ui-divider)]"
                                >
                                  +{extraFunds.length}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }).flatMap((element, index) => {
                      const item = displayed[index];
                      const isOpen = openKey === item.key;
                      if (!isOpen) return [element];
                      const detailRow = (
                        <tr
                          key={`${item.key}-detail`}
                          data-testid={`common-detail-${item.key}`}
                          className="border-b border-[var(--ui-divider)] bg-[var(--ui-card)]"
                        >
                          <td colSpan={5} className="py-3 px-4">
                            <ul aria-label={`Funds holding ${item.row.instrument_name}`} className="space-y-1.5">
                              {item.funds.map(f => (
                                <li
                                  key={f.scheme_id}
                                  data-testid={`common-fund-${item.key}-${f.scheme_id}`}
                                  className="text-xs text-[var(--ui-text-muted)]"
                                >
                                  {f.scheme_name} — {formatLookthroughPercent(f.stock_weight_pct)}% of fund
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );
                      return [element, detailRow];
                    })}
                  </tbody>
                </table>
              </div>

              {common.length > COMMON_LIMIT && (
                <div className="pt-2">
                  <button
                    type="button"
                    aria-expanded={showAll}
                    data-clickable=""
                    data-effect="expand"
                    onClick={() => {
                      if (showAll) {
                        setOpenKey(null);
                      }
                      setShowAll(!showAll);
                    }}
                    className="text-xs font-semibold text-[var(--pos-text)] hover:underline inline-flex items-center gap-1"
                  >
                    {showAll ? "Show fewer" : "View all common holdings →"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
