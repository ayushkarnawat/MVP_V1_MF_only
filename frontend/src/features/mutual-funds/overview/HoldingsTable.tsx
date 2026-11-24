import { Fragment, useState, type MouseEvent } from "react";
import { Button } from "../../../components/ui/button";
import { FolioNumber } from "../../../components/mf/FolioNumber";
import { compareDecimalStrings, formatDecimal, sumDecimalStrings } from "../../../lib/decimal";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { Skeleton } from "../../../components/ui/skeleton";
import { categoryLabel } from "@/lib/categoryLabel";
import { formatRupees } from "../../../lib/format";
import { usePrintMode } from "../../../lib/printMode";
import {
  CAUTION_CHIP,
  type XirrCaution,
} from "../../../lib/xirrDisplay";
import { paths } from "../../../shell/nav/paths";
import { useAppNavigate } from "../../../shell/nav/useAppNavigate";
import { FundLink } from "../common/FundLink";
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
import type { SearchChip } from "../../../components/search/usePageSearchState";
import type { ConsolidatedHolding, ConsolidatedHoldingChild, HoldingRow, Load } from "../types";
import { filterHoldingRows } from "./overviewSearch";

export interface SchemeXirrMeta {
  xirr_as_of?: string | null;
  xirr_basis?: XirrBasis | null;
  since_purchase_return?: string | null;
  xirr_caution?: XirrCaution | null;
}

export interface HoldingsTableProps {
  holdings: Load<HoldingRow[]>;
  consolidated?: ConsolidatedHolding[] | null;
  xirrByScheme: Record<string, string | null | undefined>;
  xirrMetaByScheme?: Partial<Record<string, SchemeXirrMeta>>;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  query: string;
  chips?: SearchChip[];
  onAnalyse: () => void;
  onCompareDistributors: () => void;
}

function CautionChip({ caution }: { caution: XirrCaution }) {
  const printMode = usePrintMode();
  const { text, tip } = CAUTION_CHIP[caution];
  const tone =
    caution === "young"
      ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
      : "border border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)]";
  const size = printMode
    ? "px-1.5 py-0.5 text-[10px] leading-tight text-center whitespace-normal"
    : "px-2 py-0.5 text-[11px]";
  return (
    <span
      role="note"
      data-testid="xirr-caution"
      title={tip}
      aria-label={tip}
      className={`inline-flex w-fit items-center rounded-full font-medium ${size} ${tone}`}
    >
      {text}
    </span>
  );
}

function XirrFigure({ value, caution }: { value: string | null | undefined; caution: XirrCaution | null | undefined }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span>{formatXirr(value)}</span>
      {caution ? <CautionChip caution={caution} /> : null}
    </div>
  );
}

export function HoldingsTable(props: HoldingsTableProps) {
  const printMode = usePrintMode();
  return printMode ? <HoldingsTableContent {...props} sort={null} query="" chips={[]} openFund={() => {}} /> : <NavigableHoldingsTable {...props} />;
}

function NavigableHoldingsTable(props: HoldingsTableProps) {
  const navigate = useAppNavigate();
  return <HoldingsTableContent {...props} openFund={schemeId => { if (schemeId) navigate(paths.mutualFunds.fund(schemeId)); }} />;
}

function HoldingsTableContent({
  holdings,
  consolidated,
  xirrByScheme,
  xirrMetaByScheme,
  sort,
  onSort,
  query,
  chips = [],
  onAnalyse,
  onCompareDistributors,
  openFund,
}: HoldingsTableProps & { openFund: (schemeId: string) => void }) {
  const printMode = usePrintMode();
  // The row is a convenience target; the name is the real link. A click that landed on a link is that link's to handle, so the row never navigates a second time.
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
        {!printMode && <button
          type="button"
          onClick={holdings.retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>}
      </section>
    );
  }

  if (consolidated != null) return <FamilyHoldingsTable rows={consolidated} sort={sort} onSort={onSort}
    query={query} chips={chips} onAnalyse={onAnalyse} onCompareDistributors={onCompareDistributors} />;

  const filteredRows = filterHoldingRows(holdings.data, query, chips);

  const returnsByScheme: Record<string, string | null | undefined> = {};
  for (const row of filteredRows) {
    returnsByScheme[row.scheme_id] = xirrMetaByScheme?.[row.scheme_id]?.since_purchase_return;
  }

  const sortedRows = sortHoldings(filteredRows, sort, xirrByScheme, returnsByScheme);
  const totals = holdingTotals(filteredRows);

  const sortColumns: Array<{ key: SortKey; label: string; title?: string }> = [
    { key: "invested", label: "Invested" },
    { key: "value", label: "Value" },
    { key: "gain", label: "Gain/Loss" },
    { key: "returns", label: "Returns", title: "Total gain as a share of money paid in, not annualised." },
    { key: "xirr", label: "XIRR", title: "Yearly rate, worked out from the dates of your investments." },
    { key: "today_change", label: "Today's change" },
  ];

  return (
    <section id="overview-mutual-funds" className="scroll-mt-6 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h3 id="holdings-title" className="text-base font-semibold text-[var(--ui-text)]">
          Mutual Funds ({filteredRows.length})
        </h3>
        {!printMode && <div className="flex flex-wrap items-center gap-2">
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
        </div>}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--ui-text-muted)]">
          No funds match "{query.trim()}"
        </div>
      ) : (
        <div className={printMode ? "" : "overflow-x-auto"}>
          <table className={`w-full text-left text-sm${printMode ? " table-fixed" : ""}`}>
            <thead>
              <tr className="border-b border-[var(--ui-divider)] text-xs font-medium text-[var(--ui-text-muted)]">
                {/* Print widths: with the two extra columns the six figure columns need about 11.7% each (about 71 px of text at an A4 content width) so a rupee amount such as ₹12,00,000 does not run into its neighbour. */}
                <th className={printMode ? "py-3 px-1 font-medium" : "py-3 pr-4 font-medium"} style={printMode ? { width: "20%" } : undefined}>Fund</th>
                <th className={printMode ? "py-3 px-1 font-medium" : "py-3 px-4 font-medium"} style={printMode ? { width: "10%" } : undefined}>Category</th>
                {sortColumns.map(col => {
                  const isSorted = sort?.key === col.key;
                  const ariaSort = isSorted
                    ? sort.dir === "desc"
                      ? "descending"
                      : "ascending"
                    : "none";
                  return (
                    <th key={col.key} aria-sort={ariaSort} title={col.title} className={printMode ? "py-3 px-1 font-medium" : "py-3 px-4 font-medium"}>
                      {printMode ? col.label : <button
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
                      </button>}
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
                    tabIndex={printMode ? undefined : 0}
                    data-clickable={printMode ? undefined : ""}
                    data-effect={printMode ? undefined : "navigate"}
                    onClick={printMode ? undefined : e => {
                      if (!fromLink(e)) openFund(row.scheme_id);
                    }}
                    onKeyDown={printMode ? undefined : e => {
                      // Enter on the name link is the link's own; only Enter on the row itself opens the fund here.
                      if (e.key === "Enter" && e.target === e.currentTarget) openFund(row.scheme_id);
                    }}
                    className={printMode ? "" : "cursor-pointer hover:bg-[var(--ui-row-hover)]"}
                  >
                    <td className={printMode ? "py-3 px-1" : "py-3 pr-4"}>
                      <div className="flex items-center gap-3">
                        {!printMode && <span data-testid="fund-logo" className="shrink-0">
                          <SchemeLogo
                            amcName={row.amc_name}
                            schemeName={row.scheme_name}
                            size="sm"
                          />
                        </span>}
                        <div className="flex flex-col min-w-0">
                          <span
                            title={printMode ? undefined : row.scheme_name}
                            className={printMode ? "font-medium text-[var(--ui-text)] break-words" : "font-medium text-[var(--ui-text)] truncate max-w-xs"}
                          >
                            {printMode ? row.scheme_name : <FundLink schemeId={row.scheme_id}>{row.scheme_name}</FundLink>}
                          </span>
                          {row.amc_name && (
                            <span className={`text-xs text-[var(--ui-text-muted)]${printMode ? " break-words" : " truncate"}`}>
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
                    <td data-testid="category" className={`py-3 ${printMode ? "px-1" : "px-4"} text-[var(--ui-text-muted)]`}>
                      {categoryLabel(row.sebi_category)}
                    </td>
                    <td data-testid="invested" className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium text-[var(--ui-text)]`}>
                      {formatRupees(row.amount_invested)}
                    </td>
                    <td data-testid="value" className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium text-[var(--ui-text)]`}>
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
                      className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium`}
                    >
                      {row.nav_unavailable || row.unrealized_gain == null
                        ? "—"
                        : formatSignedRupees(row.unrealized_gain)}
                    </td>
                    <td data-testid="returns" className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium text-[var(--ui-text)]`}>
                      {formatXirr(xirrMetaByScheme?.[row.scheme_id]?.since_purchase_return)}
                    </td>
                    <td data-testid="xirr" className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium text-[var(--ui-text)]`}>
                      <XirrFigure
                        value={xirrByScheme[row.scheme_id]}
                        caution={xirrMetaByScheme?.[row.scheme_id]?.xirr_caution}
                      />
                    </td>
                    <td
                      data-testid="today"
                      data-direction={
                        todayPct !== null ? changeDirection(row.today_gain) : undefined
                      }
                      className={`py-3 ${printMode ? "px-1" : "px-4"} font-medium`}
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
                <td className={printMode ? "py-3 px-1" : "py-3 pr-4"}>Total</td>
                <td className={printMode ? "py-3 px-1" : "py-3 px-4"}></td>
                <td data-testid="foot-invested" className={printMode ? "py-3 px-1" : "py-3 px-4"}>
                  {formatRupees(totals.invested)}
                </td>
                <td data-testid="foot-value" className={printMode ? "py-3 px-1" : "py-3 px-4"}>
                  {formatRupees(totals.value)}
                </td>
                <td data-testid="foot-gain" className={printMode ? "py-3 px-1" : "py-3 px-4"}>
                  {formatSignedRupees(totals.unrealised)}
                </td>
                <td className={printMode ? "py-3 px-1" : "py-3 px-4"}></td>
                <td className={printMode ? "py-3 px-1" : "py-3 px-4"}></td>
                <td className={printMode ? "py-3 px-1" : "py-3 px-4"}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}


/** Ownership shares in whole hundredths of a percent that always total exactly 100 (largest remainder). */
function splitShares(units: string[]): string[] {
  // Anything that is not plain non-negative decimal text (exponent form, a minus, junk) counts as no units, so BigInt never throws mid-render.
  const valid = units.map(u => /^\d+(\.\d+)?$/.test(u));
  const scale = Math.max(0, ...units.map((u, i) => (valid[i] ? (u.split(".")[1] ?? "").length : 0)));
  const parse = (u: string, i: number) => { if (!valid[i]) return 0n; const [w, f = ""] = u.split("."); return BigInt(w + f.padEnd(scale, "0")); };
  const parts = units.map(parse);
  const total = parts.reduce((a, b) => a + b, 0n);
  if (total === 0n) return units.map(() => "0.00");
  const floors = parts.map(p => (p * 10000n) / total);
  let left = 10000n - floors.reduce((a, b) => a + b, 0n);
  const order = parts.map((p, i) => ({ i, rem: (p * 10000n) % total })).sort((a, b) => (a.rem < b.rem ? 1 : a.rem > b.rem ? -1 : a.i - b.i));
  for (const { i } of order) { if (left <= 0n) break; floors[i] += 1n; left -= 1n; }
  return floors.map(f => `${f / 100n}.${String(f % 100n).padStart(2, "0")}`);
}

const MEMBER_COLOURS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
// Print widths of the nine family columns (sum 100%). Measured in a browser at an A4 content width with 11 px text and large amounts:
// the short columns (Units, Avg price) give way so the money columns keep about 70 px of text and a rupee amount such as
// +₹6,80,000 is not split in the middle of the number.
const FAMILY_PRINT_WIDTHS: Record<string, string> = {
  Fund: "19%", Units: "9%", "Avg price": "9%", Invested: "11.5%", "Current value": "11.5%",
  Unrealised: "11.5%", Realised: "9.5%", Returns: "9%", XIRR: "10%",
};
const FAMILY_COLUMNS: Array<{ label: string; key?: SortKey; title?: string }> = [
  { label: "Fund" }, { label: "Units" }, { label: "Avg price" }, { label: "Invested", key: "invested" },
  { label: "Current value", key: "value" }, { label: "Unrealised", key: "gain" }, { label: "Realised" },
  { label: "Returns", key: "returns", title: "Total gain as a share of money paid in, not annualised." },
  { label: "XIRR", key: "xirr", title: "Yearly rate, worked out from the dates of your investments." },
];

function FamilyFigures({ row, child = false }: { row: ConsolidatedHolding | ConsolidatedHoldingChild; child?: boolean }) {
  const printMode = usePrintMode();
  const average = "average_price" in row ? row.average_price : row.average_nav;
  const figures = [row.units_held, average == null ? "—" : formatDecimal(average), formatRupees(row.amount_invested),
    row.nav_unavailable || row.current_value == null ? "—" : formatRupees(row.current_value),
    row.nav_unavailable || row.unrealized_gain == null ? "—" : formatSignedRupees(row.unrealized_gain),
    formatSignedRupees(row.realized_gain)];
  return <>
    {figures.map((figure, index) => <td key={FAMILY_COLUMNS[index + 1].label}
      className={printMode ? "px-1 py-3 tabular-nums break-words" : "px-4 py-3 sm:py-5 tabular-nums whitespace-nowrap"}>
      {!printMode && <span className="block text-xs text-[var(--ui-text-muted)] sm:hidden">{FAMILY_COLUMNS[index + 1].label}</span>}
      {figure}
    </td>)}
    {/* The test ids sit on the figure itself, not the cell, so the phone-only column label in the cell is not part of the figure's text. */}
    <td className={printMode ? "px-1 py-3 tabular-nums break-words" : "px-4 py-3 sm:py-5 tabular-nums whitespace-nowrap"}>
      {!printMode && <span className="block text-xs text-[var(--ui-text-muted)] sm:hidden">{FAMILY_COLUMNS[7].label}</span>}
      <span data-testid={child ? "child-returns" : "returns"}>{formatXirr(row.since_purchase_return)}</span>
    </td>
    <td className={printMode ? "px-1 py-3 tabular-nums break-words" : "px-4 py-3 sm:py-5 tabular-nums whitespace-nowrap"}>
      {!printMode && <span className="block text-xs text-[var(--ui-text-muted)] sm:hidden">{FAMILY_COLUMNS[8].label}</span>}
      <div data-testid={child ? "child-xirr" : "xirr"}><XirrFigure value={row.xirr} caution={row.xirr_caution} /></div>
    </td>
  </>;
}

function FamilyHoldingStatus({ row }: { row: ConsolidatedHolding | ConsolidatedHoldingChild }) {
  return <>
    {row.nav_unavailable && <span className="block text-xs text-[var(--ui-text-muted)]">Price unavailable</span>}
    {row.stale_nav && <span className="block text-xs text-[var(--ui-text-muted)]">Older price</span>}
    {row.price_from_statement && <span className="block text-xs text-[var(--ui-text-muted)]">Price from statement</span>}
    {row.opening_lot && <span className="block text-xs text-[var(--ui-text-muted)]">Includes an opening balance</span>}
  </>;
}

function FamilyHoldingsTable({ rows, sort, onSort, query, chips = [], onAnalyse, onCompareDistributors }: {
  rows: ConsolidatedHolding[]; sort: SortState | null; onSort: (next: SortState) => void;
  query: string; chips?: SearchChip[]; onAnalyse: () => void; onCompareDistributors: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const printMode = usePrintMode();
  const filtered = filterHoldingRows(rows, query, chips);
  const valueFor = (r: ConsolidatedHolding): string | null => {
    if (sort?.key === "invested") return r.amount_invested;
    if (sort?.key === "value") return r.nav_unavailable ? null : r.current_value;
    if (sort?.key === "gain") return r.nav_unavailable ? null : r.unrealized_gain;
    if (sort?.key === "returns") return r.since_purchase_return ?? null;
    if (sort?.key === "xirr") return r.xirr ?? null;
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
  return <section id="overview-mutual-funds" className="scroll-mt-6 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <h3 id="holdings-title" className="text-base font-semibold text-[var(--ui-text)]">Mutual Funds ({shown.length})</h3>
      {!printMode && <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" data-clickable="" data-effect="open" onClick={onCompareDistributors}>Compare Distributors</Button>
        <Button type="button" variant="outline" size="sm" data-clickable="" data-effect="open" onClick={onAnalyse}>Analyse with Mira</Button>
      </div>}
    </div>
    {shown.length === 0 ? <p className="py-8 text-center text-sm text-[var(--ui-text-muted)]">No funds match "{query.trim()}"</p> :
    <div data-testid={printMode ? undefined : "family-phone-cards"} className={printMode ? "" : "overflow-x-auto"}>
      <table aria-labelledby="holdings-title" className={printMode ? "table w-full table-fixed text-left text-xs" : "block w-full text-left text-sm sm:table sm:min-w-[960px]"}>
        <thead className={printMode ? "table-header-group" : "hidden sm:table-header-group"}><tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
          {FAMILY_COLUMNS.map(col => <th key={col.label} title={col.title} className={printMode ? "px-1 py-4 font-medium" : "px-4 py-4 font-medium"} style={printMode ? { width: FAMILY_PRINT_WIDTHS[col.label] } : undefined}
            aria-sort={col.key && sort?.key === col.key ? sort.dir === "desc" ? "descending" : "ascending" : undefined}>
            {col.key && !printMode ? <button type="button" data-clickable="" data-effect="sort" onClick={() => onSort(nextSort(sort, col.key!))}>{col.label}</button> : col.label}
          </th>)}
        </tr></thead>
        {shown.map(parent => {
          const key = `${parent.scheme_id}:${parent.plan_type}`;
          const open = Boolean(printMode) || expanded.has(key), multiple = parent.children.length > 1;
          const shares = splitShares(parent.children.map(c => c.units_held));
          const toggle = () => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
          return <tbody key={key} className={printMode ? "table-row-group" : "mb-4 block overflow-hidden rounded-xl border border-[var(--ui-divider)] sm:mb-0 sm:table-row-group sm:rounded-none sm:border-0"}>
            <tr data-testid={`parent-${key}`} className={printMode ? "table-row border-b border-[var(--ui-divider)]" : "grid grid-cols-2 border-b border-[var(--ui-divider)] sm:table-row"}>
              <td className={printMode ? "px-1 py-3 break-words" : "col-span-2 px-4 py-5 sm:min-w-64"}>
                <div className="flex items-start gap-3">
                  {!printMode && <SchemeLogo amcName={parent.amc_name} schemeName={parent.scheme_name} size="sm" />}
                  <div className="min-w-0 flex-1">
                    {printMode ? parent.scheme_name : <FundLink schemeId={parent.scheme_id}>{parent.scheme_name}</FundLink>}
                    <span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{parent.plan_type === "direct" ? "Direct" : parent.plan_type === "regular" ? "Regular" : ""}</span>
                    <FamilyHoldingStatus row={parent} />
                    {!multiple && !printMode && parent.children[0] && (
                      <span className="mt-1 block text-xs text-[var(--ui-text-muted)]">
                        {parent.children[0].household_member_name}
                        {parent.children[0].folios?.map(f => (
                          <Fragment key={f.folio_id}>
                            {" · "}
                            <FolioNumber value={f.folio_number} />
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </div>
                  {multiple && !printMode && <Button type="button" variant="outline" size="sm" aria-label={`${open ? "Collapse" : "Expand"} ${parent.scheme_name}`}
                    aria-expanded={open} data-clickable="" data-effect="expand" onClick={toggle}>{open ? "−" : "+"}</Button>}
                </div>
                {multiple && <div className="mt-3 space-y-2">
                  <div data-testid="split-bar" role="img" aria-label={`Ownership of ${parent.scheme_name} by member`} className="flex h-1.5 overflow-hidden rounded-full bg-[var(--ui-divider)]">
                    {parent.children.map((c, index) => <span key={c.household_member_id} data-testid={`share-${c.household_member_id}`}
                      style={{ width: `${shares[index]}%`, background: MEMBER_COLOURS[index % MEMBER_COLOURS.length] }} />)}
                  </div>
                  <ul aria-label="Member shares" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)]">
                    {parent.children.map((c, index) => <li key={c.household_member_id} className="flex items-center gap-1">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: MEMBER_COLOURS[index % MEMBER_COLOURS.length] }} />
                      {c.household_member_name} {shares[index]}%
                    </li>)}
                  </ul>
                </div>}
              </td>
              <FamilyFigures row={parent} />
            </tr>
            {(multiple || printMode) && open && parent.children.map(c => <tr key={c.household_member_id} data-testid={`member-${key}:${c.household_member_id}`}
              className={printMode ? "table-row border-b border-[var(--ui-divider)] bg-[var(--ui-hover)]" : "grid grid-cols-2 border-b border-[var(--ui-divider)] bg-[var(--ui-hover)] sm:table-row"}>
              <td className="col-span-2 px-6 py-4 sm:pl-12">
                <span className="block font-medium">{c.household_member_name}</span>
                {c.folios?.map(f => <span key={f.folio_id} className="mt-1 block text-xs text-[var(--ui-text-muted)]"><FolioNumber value={f.folio_number} /></span>)}
                <FamilyHoldingStatus row={c} />
              </td>
              <FamilyFigures row={c} child />
            </tr>)}
          </tbody>;
        })}
        <tfoot className={printMode ? "table-footer-group" : "block sm:table-footer-group"}>
          <tr className={printMode ? "table-row border-t-2 border-[var(--ui-divider)] font-semibold" : "grid grid-cols-2 border-t-2 border-[var(--ui-divider)] font-semibold sm:table-row"}>
            <td className={printMode ? "col-span-2 px-1 py-5" : "col-span-2 px-4 py-5"}>Total</td>
            <td className={printMode ? "px-1 py-5" : "px-4 py-5"}>—</td><td className={printMode ? "px-1 py-5" : "px-4 py-5"}>—</td>
            <td data-testid="foot-invested" className={printMode ? "px-1 py-5" : "px-4 py-5"}>{!printMode && <span className="block text-xs sm:hidden">Invested</span>}{formatRupees(totalFor("amount_invested"))}</td>
            <td data-testid="foot-value" className={printMode ? "px-1 py-5" : "px-4 py-5"}>{!printMode && <span className="block text-xs sm:hidden">Current value</span>}{formatRupees(totalFor("current_value"))}</td>
            <td data-testid="foot-gain" className={printMode ? "px-1 py-5" : "px-4 py-5"}>{!printMode && <span className="block text-xs sm:hidden">Unrealised</span>}{formatSignedRupees(totalFor("unrealized_gain"))}</td>
            <td data-testid="foot-realized" className={printMode ? "px-1 py-5" : "px-4 py-5"}>{!printMode && <span className="block text-xs sm:hidden">Realised</span>}{formatSignedRupees(totalFor("realized_gain"))}</td>
            <td className={printMode ? "px-1 py-5" : "px-4 py-5"}>—</td>
            <td className={printMode ? "px-1 py-5" : "px-4 py-5"}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>}
  </section>;
}
