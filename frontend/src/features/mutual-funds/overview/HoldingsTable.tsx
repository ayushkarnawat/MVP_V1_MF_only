import { SchemeLogo } from "../../../components/SchemeLogo";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatRupees } from "../../../lib/format";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  holdingTotals,
  nextSort,
  sortHoldings,
  todayChangePct,
  type SortKey,
  type SortState,
} from "../mfCopy";
import type { HoldingRow, Load } from "../types";

export interface HoldingsTableProps {
  holdings: Load<HoldingRow[]>;
  xirrByScheme: Record<string, string | null | undefined>;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  query: string;
  onOpenFund: (schemeId: string, memberId: string) => void;
  onAnalyse: () => void;
  onCompareDistributors: () => void;
}

export function HoldingsTable({
  holdings,
  xirrByScheme,
  sort,
  onSort,
  query,
  onOpenFund,
  onAnalyse,
  onCompareDistributors,
}: HoldingsTableProps) {
  if (holdings.status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading holdings"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    );
  }

  if (holdings.status === "error" || holdings.data === null) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load your holdings
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={holdings.retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  const trimmedQuery = query.trim().toLowerCase();
  const filteredRows = holdings.data.filter(h => {
    if (!trimmedQuery) return true;
    const nameMatch = h.scheme_name.toLowerCase().includes(trimmedQuery);
    const amcMatch = h.amc_name ? h.amc_name.toLowerCase().includes(trimmedQuery) : false;
    return nameMatch || amcMatch;
  });

  const sortedRows = sortHoldings(filteredRows, sort, xirrByScheme);
  const totals = holdingTotals(filteredRows);

  const sortColumns: Array<{ key: SortKey; label: string }> = [
    { key: "invested", label: "Invested" },
    { key: "value", label: "Value" },
    { key: "gain", label: "Gain/Loss" },
    { key: "xirr", label: "XIRR" },
    { key: "today_change", label: "Today's change" },
  ];

  return (
    <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h3 id="holdings-title" className="text-base font-semibold text-[var(--ui-text)]">
          Mutual Funds ({filteredRows.length})
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-clickable=""
            data-effect="open"
            onClick={onCompareDistributors}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
          >
            Compare Distributors
          </button>
          <button
            type="button"
            data-clickable=""
            data-effect="open"
            onClick={onAnalyse}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
          >
            Analyse with Mira
          </button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--ui-text-muted)]">
          No funds match "{query.trim()}"
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-divider)] text-xs font-medium text-[var(--ui-text-muted)]">
                <th className="py-3 pr-4 font-medium">Fund</th>
                <th className="py-3 px-4 font-medium">Category</th>
                {sortColumns.map(col => {
                  const isSorted = sort?.key === col.key;
                  const ariaSort = isSorted
                    ? sort.dir === "desc"
                      ? "descending"
                      : "ascending"
                    : "none";
                  return (
                    <th key={col.key} aria-sort={ariaSort} className="py-3 px-4 font-medium">
                      <button
                        type="button"
                        data-clickable=""
                        data-effect="sort"
                        onClick={() => onSort(nextSort(sort, col.key))}
                        className="inline-flex items-center gap-1 hover:text-[var(--ui-text)]"
                      >
                        <span>{col.label}</span>
                        {isSorted && (
                          <span data-testid="sort-arrow" aria-hidden="true">
                            {sort.dir === "desc" ? "↓" : "↑"}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-divider)]">
              {sortedRows.map(row => {
                const todayPct = todayChangePct(row);
                return (
                  <tr
                    key={`${row.scheme_id}:${row.household_member_id}`}
                    data-testid={`row-${row.scheme_id}:${row.household_member_id}`}
                    tabIndex={0}
                    data-clickable=""
                    data-effect="open"
                    onClick={() => onOpenFund(row.scheme_id, row.household_member_id)}
                    onKeyDown={e => {
                      if (e.key === "Enter") onOpenFund(row.scheme_id, row.household_member_id);
                    }}
                    className="cursor-pointer hover:bg-[var(--ui-row-hover)]"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <span data-testid="fund-logo" className="shrink-0">
                          <SchemeLogo
                            amcName={row.amc_name}
                            schemeName={row.scheme_name}
                            size="sm"
                          />
                        </span>
                        <div className="flex flex-col min-w-0">
                          <button
                            type="button"
                            title={row.scheme_name}
                            data-clickable=""
                            data-effect="open"
                            onClick={e => {
                              e.stopPropagation();
                              onOpenFund(row.scheme_id, row.household_member_id);
                            }}
                            className="text-left font-medium text-[var(--ui-text)] truncate max-w-xs hover:underline"
                          >
                            {row.scheme_name}
                          </button>
                          {row.amc_name && (
                            <span className="text-xs text-[var(--ui-text-muted)] truncate">
                              {row.amc_name}
                            </span>
                          )}
                          {(row.plan_type === "direct" || row.plan_type === "regular") && (
                            <span
                              data-testid="plan-badge"
                              className="mt-0.5 inline-block text-[11px] font-semibold text-[var(--ui-text-muted)]"
                            >
                              {row.plan_type === "direct" ? "Direct" : "Regular"}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-testid="category" className="py-3 px-4 text-[var(--ui-text-muted)]">
                      {row.sebi_category || "—"}
                    </td>
                    <td data-testid="invested" className="py-3 px-4 font-medium text-[var(--ui-text)]">
                      {formatRupees(row.amount_invested)}
                    </td>
                    <td data-testid="value" className="py-3 px-4 font-medium text-[var(--ui-text)]">
                      {row.nav_unavailable || row.current_value == null
                        ? "—"
                        : formatRupees(row.current_value)}
                    </td>
                    <td
                      data-testid="gain"
                      data-direction={
                        row.nav_unavailable || row.unrealized_gain == null
                          ? undefined
                          : changeDirection(row.unrealized_gain)
                      }
                      className="py-3 px-4 font-medium"
                    >
                      {row.nav_unavailable || row.unrealized_gain == null
                        ? "—"
                        : formatSignedRupees(row.unrealized_gain)}
                    </td>
                    <td data-testid="xirr" className="py-3 px-4 font-medium text-[var(--ui-text)]">
                      {formatXirr(xirrByScheme[row.scheme_id])}
                    </td>
                    <td
                      data-testid="today"
                      data-direction={
                        todayPct !== null ? changeDirection(row.today_gain) : undefined
                      }
                      className="py-3 px-4 font-medium"
                    >
                      {todayPct !== null ? (
                        <div className="flex flex-col">
                          <span data-testid="today-amount">{formatSignedRupees(row.today_gain)}</span>
                          <span data-testid="today-percent">{formatSignedPercent(todayPct, 2)}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--ui-divider)] font-semibold text-[var(--ui-text)]">
                <td className="py-3 pr-4">Total</td>
                <td className="py-3 px-4"></td>
                <td data-testid="foot-invested" className="py-3 px-4">
                  {formatRupees(totals.invested)}
                </td>
                <td data-testid="foot-value" className="py-3 px-4">
                  {formatRupees(totals.value)}
                </td>
                <td data-testid="foot-gain" className="py-3 px-4">
                  {formatSignedRupees(totals.unrealised)}
                </td>
                <td className="py-3 px-4"></td>
                <td className="py-3 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
