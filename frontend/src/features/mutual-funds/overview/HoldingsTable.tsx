import { useState, type MouseEvent } from "react";
import { Button } from "../../../components/ui/button";
import { compareDecimalStrings, formatDecimal, sumDecimalStrings } from "../../../lib/decimal";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatRupees } from "../../../lib/format";
import { paths } from "../../../shell/nav/paths";
import { useAppNavigate } from "../../../shell/nav/useAppNavigate";
import { FundLink } from "../common/FundLink";
import {
  changeDirection,
  percentOf,
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
import type { ConsolidatedHolding, ConsolidatedHoldingChild, HoldingRow, Load } from "../types";

export interface HoldingsTableProps {
  holdings: Load<HoldingRow[]>;
  consolidated?: ConsolidatedHolding[] | null;
  xirrByScheme: Record<string, string | null | undefined>;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  query: string;
  onAnalyse: () => void;
  onCompareDistributors: () => void;
}

export function HoldingsTable({
  holdings,
  consolidated,
  xirrByScheme,
  sort,
  onSort,
  query,
  onAnalyse,
  onCompareDistributors,
}: HoldingsTableProps) {
  const navigate = useAppNavigate();
  // The row is a convenience target; the name is the real link. A click that landed on a link is that link's to handle, so the row never navigates a second time.
  const openFund = (schemeId: string) => {
    if (schemeId) navigate(paths.mutualFunds.fund(schemeId));
  };
  const fromLink = (e: MouseEvent) => (e.target as HTMLElement).closest("a, [role=link]") !== null;
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

  if (consolidated != null) return <FamilyHoldingsTable rows={consolidated} sort={sort} onSort={onSort}
    query={query} onAnalyse={onAnalyse} onCompareDistributors={onCompareDistributors} />;

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
                    data-effect="navigate"
                    onClick={e => {
                      if (!fromLink(e)) openFund(row.scheme_id);
                    }}
                    onKeyDown={e => {
                      // Enter on the name link is the link's own; only Enter on the row itself opens the fund here.
                      if (e.key === "Enter" && e.target === e.currentTarget) openFund(row.scheme_id);
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
                          <span
                            title={row.scheme_name}
                            className="font-medium text-[var(--ui-text)] truncate max-w-xs"
                          >
                            <FundLink schemeId={row.scheme_id}>{row.scheme_name}</FundLink>
                          </span>
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


const MEMBER_COLOURS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
const FAMILY_COLUMNS: Array<{ label: string; key?: SortKey }> = [
  { label: "Fund" }, { label: "Units" }, { label: "Avg price" }, { label: "Invested", key: "invested" },
  { label: "Current value", key: "value" }, { label: "Unrealised", key: "gain" }, { label: "Realised" }, { label: "XIRR", key: "xirr" },
];

function FamilyFigures({ row, child = false }: { row: ConsolidatedHolding | ConsolidatedHoldingChild; child?: boolean }) {
  const average = "average_price" in row ? row.average_price : row.average_nav;
  const figures = [row.units_held, average == null ? "—" : formatDecimal(average), formatRupees(row.amount_invested),
    row.nav_unavailable || row.current_value == null ? "—" : formatRupees(row.current_value),
    row.nav_unavailable || row.unrealized_gain == null ? "—" : formatSignedRupees(row.unrealized_gain),
    formatSignedRupees(row.realized_gain), formatXirr(row.xirr)];
  return figures.map((figure, index) => <td key={FAMILY_COLUMNS[index + 1].label}
    data-testid={child && index === 6 ? "child-xirr" : undefined}
    className="px-4 py-3 sm:py-5 tabular-nums whitespace-nowrap">
    <span className="block text-xs text-[var(--ui-text-muted)] sm:hidden">{FAMILY_COLUMNS[index + 1].label}</span>
    {figure}
  </td>);
}

function FamilyHoldingStatus({ row }: { row: ConsolidatedHolding | ConsolidatedHoldingChild }) {
  return <>
    {row.nav_unavailable && <span className="block text-xs text-[var(--ui-text-muted)]">Price unavailable</span>}
    {row.stale_nav && <span className="block text-xs text-[var(--ui-text-muted)]">Older price</span>}
    {row.price_from_statement && <span className="block text-xs text-[var(--ui-text-muted)]">Price from statement</span>}
    {row.opening_lot && <span className="block text-xs text-[var(--ui-text-muted)]">Includes an opening balance</span>}
  </>;
}

function FamilyHoldingsTable({ rows, sort, onSort, query, onAnalyse, onCompareDistributors }: {
  rows: ConsolidatedHolding[]; sort: SortState | null; onSort: (next: SortState) => void;
  query: string; onAnalyse: () => void; onCompareDistributors: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const term = query.trim().toLowerCase();
  const filtered = rows.filter(r => `${r.scheme_name} ${r.amc_name}`.toLowerCase().includes(term));
  const valueFor = (r: ConsolidatedHolding): string | null => {
    if (sort?.key === "invested") return r.amount_invested;
    if (sort?.key === "value") return r.nav_unavailable ? null : r.current_value;
    if (sort?.key === "gain") return r.nav_unavailable ? null : r.unrealized_gain;
    if (sort?.key === "xirr") return r.xirr;
    return null;
  };
  const shown = sort ? [...filtered].sort((a, b) => {
    const av = valueFor(a), bv = valueFor(b);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const cmp = compareDecimalStrings(av, bv);
    return sort.dir === "asc" ? cmp : -cmp;
  }) : filtered;
  const totalFor = (field: "amount_invested" | "current_value" | "unrealized_gain" | "realized_gain"): string | null => {
    const values = filtered.map(row => row[field]);
    return values.some(value => value == null) ? null : sumDecimalStrings(values.map(value => value ?? "0"));
  };
  return <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <h3 id="holdings-title" className="text-base font-semibold text-[var(--ui-text)]">Mutual Funds ({shown.length})</h3>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" data-clickable="" data-effect="open" onClick={onCompareDistributors}>Compare Distributors</Button>
        <Button type="button" variant="outline" size="sm" data-clickable="" data-effect="open" onClick={onAnalyse}>Analyse with Mira</Button>
      </div>
    </div>
    {shown.length === 0 ? <p className="py-8 text-center text-sm text-[var(--ui-text-muted)]">No funds match "{query.trim()}"</p> :
    <div data-testid="family-phone-cards" className="overflow-x-auto">
      <table aria-labelledby="holdings-title" className="block w-full text-left text-sm sm:table sm:min-w-[960px]">
        <thead className="hidden sm:table-header-group"><tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
          {FAMILY_COLUMNS.map(col => <th key={col.label} className="px-4 py-4 font-medium"
            aria-sort={col.key && sort?.key === col.key ? sort.dir === "desc" ? "descending" : "ascending" : undefined}>
            {col.key ? <button type="button" data-clickable="" data-effect="sort" onClick={() => onSort(nextSort(sort, col.key!))}>{col.label}</button> : col.label}
          </th>)}
        </tr></thead>
        {shown.map(parent => {
          const key = `${parent.scheme_id}:${parent.plan_type}`;
          const open = expanded.has(key), multiple = parent.children.length > 1;
          const toggle = () => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
          return <tbody key={key} className="mb-4 block overflow-hidden rounded-xl border border-[var(--ui-divider)] sm:mb-0 sm:table-row-group sm:rounded-none sm:border-0">
            <tr data-testid={`parent-${key}`} className="grid grid-cols-2 border-b border-[var(--ui-divider)] sm:table-row">
              <td className="col-span-2 px-4 py-5 sm:min-w-64">
                <div className="flex items-start gap-3">
                  <SchemeLogo amcName={parent.amc_name} schemeName={parent.scheme_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <FundLink schemeId={parent.scheme_id}>{parent.scheme_name}</FundLink>
                    <span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{parent.plan_type === "direct" ? "Direct" : parent.plan_type === "regular" ? "Regular" : ""}</span>
                    <FamilyHoldingStatus row={parent} />
                    {!multiple && parent.children[0] && <span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{parent.children[0].household_member_name}{parent.children[0].folios?.map(f => ` · ${f.folio_masked}`).join("")}</span>}
                  </div>
                  {multiple && <Button type="button" variant="outline" size="sm" aria-label={`${open ? "Collapse" : "Expand"} ${parent.scheme_name}`}
                    aria-expanded={open} data-clickable="" data-effect="expand" onClick={toggle}>{open ? "−" : "+"}</Button>}
                </div>
                {multiple && <div className="mt-3 space-y-2">
                  <div data-testid="split-bar" role="img" aria-label={`Ownership of ${parent.scheme_name} by member`} className="flex h-1.5 overflow-hidden rounded-full bg-[var(--ui-divider)]">
                    {parent.children.map((c, index) => <span key={c.household_member_id} data-testid={`share-${c.household_member_id}`}
                      style={{ width: `${percentOf(c.units_held, parent.units_held) ?? "0"}%`, background: MEMBER_COLOURS[index % MEMBER_COLOURS.length] }} />)}
                  </div>
                  <ul aria-label="Member shares" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)]">
                    {parent.children.map((c, index) => <li key={c.household_member_id} className="flex items-center gap-1">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: MEMBER_COLOURS[index % MEMBER_COLOURS.length] }} />
                      {c.household_member_name} {percentOf(c.units_held, parent.units_held) ?? "0"}%
                    </li>)}
                  </ul>
                </div>}
              </td>
              <FamilyFigures row={parent} />
            </tr>
            {multiple && open && parent.children.map(c => <tr key={c.household_member_id} data-testid={`member-${key}:${c.household_member_id}`}
              className="grid grid-cols-2 border-b border-[var(--ui-divider)] bg-[var(--ui-hover)] sm:table-row">
              <td className="col-span-2 px-6 py-4 sm:pl-12">
                <span className="block font-medium">{c.household_member_name}</span>
                {c.folios?.map(f => <span key={f.folio_id} className="mt-1 block text-xs text-[var(--ui-text-muted)]">{f.folio_masked}</span>)}
                <FamilyHoldingStatus row={c} />
              </td>
              <FamilyFigures row={c} child />
            </tr>)}
          </tbody>;
        })}
        <tfoot className="block sm:table-footer-group">
          <tr className="grid grid-cols-2 border-t-2 border-[var(--ui-divider)] font-semibold sm:table-row">
            <td className="col-span-2 px-4 py-5">Total</td>
            <td className="px-4 py-5">—</td><td className="px-4 py-5">—</td>
            <td data-testid="foot-invested" className="px-4 py-5"><span className="block text-xs sm:hidden">Invested</span>{formatRupees(totalFor("amount_invested"))}</td>
            <td data-testid="foot-value" className="px-4 py-5"><span className="block text-xs sm:hidden">Current value</span>{formatRupees(totalFor("current_value"))}</td>
            <td data-testid="foot-gain" className="px-4 py-5"><span className="block text-xs sm:hidden">Unrealised</span>{formatSignedRupees(totalFor("unrealized_gain"))}</td>
            <td data-testid="foot-realized" className="px-4 py-5"><span className="block text-xs sm:hidden">Realised</span>{formatSignedRupees(totalFor("realized_gain"))}</td>
            <td className="px-4 py-5">—</td>
          </tr>
        </tfoot>
      </table>
    </div>}
  </section>;
}
