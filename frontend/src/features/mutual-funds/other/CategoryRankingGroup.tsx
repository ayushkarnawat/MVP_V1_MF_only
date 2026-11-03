import { useState } from "react";
import { compareDecimalStrings } from "../../../lib/decimal";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import type { CategoryRankingSummary, CategoryRankRow } from "../types";
import {
  CARD_TITLES, CATEGORY_PERIODS, CATEGORY_PERIOD_LABELS, categoryComparisonScale, categoryComparisonSummary,
  categoryGapText, categoryLinePositions, filterCategoryFunds, normalizeFraction, rawPercent, shortCategory,
} from "./otherLogic";
import type { CategoryFilter, CategoryPeriod } from "./otherLogic";

function ComparisonRow({ fund, period, scale }: { fund: CategoryRankRow; period: CategoryPeriod; scale: [number, number] }) {
  const row = fund.periods?.[period];
  const valid = row?.fund_return != null && row.category_avg != null;
  const positions = valid ? categoryLinePositions(row.fund_return!, row.category_avg!, scale) : null;
  const ahead = valid && compareDecimalStrings(normalizeFraction(row.fund_return!), normalizeFraction(row.category_avg!)) >= 0;
  const color = ahead ? "var(--pos)" : "var(--neg)";
  return <div data-testid={`comparison-${fund.scheme_id}-${period}`} className="grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[2rem_1fr_9rem]">
    <span className="text-xs font-semibold text-[var(--ui-text-muted)]">{period.toUpperCase()}</span>
    {positions ? <div aria-hidden="true" className="relative h-1 rounded-full bg-[var(--ui-divider)]">
      <span data-testid="gap-line" className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(positions.fund, positions.average)}%`, width: `${Math.abs(positions.fund - positions.average)}%`, backgroundColor: color }} />
      <span data-testid="category-dot" className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[var(--ui-text-muted)] bg-[var(--ui-card)]" style={{ left: `${positions.average}%` }} />
      <span data-testid="fund-dot" className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full" style={{ left: `${positions.fund}%`, backgroundColor: color }} />
    </div> : <p className="text-xs text-[var(--ui-text-muted)]">{row?.fund_return == null ? `Needs ${CATEGORY_PERIOD_LABELS[period]} of history` : "Category average is not available for this period."}</p>}
    <div className="col-start-2 text-xs tabular-nums sm:col-auto sm:text-right">
      {valid && <p className="font-semibold" style={{ color }}>{categoryGapText(row.fund_return!, row.category_avg!)}</p>}
      <p className="text-[var(--ui-text-muted)]"><span data-testid={`fund-${period}`}>{rawPercent(row?.fund_return)}</span> vs {rawPercent(row?.category_avg)}</p>
    </div>
  </div>;
}

export function CategoryRankingBody({ data }: { data: CategoryRankingSummary }) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const funds = filterCategoryFunds(data, filter);
  // Keep one scale and the portfolio summary stable while the chips filter cards.
  const scale = categoryComparisonScale(data);
  return <div data-testid="category-body" className="space-y-4">
    <p data-testid="category-summary" className="rounded-xl bg-[var(--pos-bg)] p-4 text-sm text-[var(--ui-text)]">{categoryComparisonSummary(data)}</p>
    <div role="group" aria-label="Filter category comparisons" className="flex flex-wrap gap-2">
      {([["all", "All funds"], ["behind", "Behind somewhere"], ["ahead", "Ahead everywhere"]] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={filter === key} data-clickable="" data-effect="select" onClick={() => setFilter(key)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === key ? "border-[var(--ui-text)] bg-[var(--ui-elevated)] text-[var(--ui-text)]" : "border-[var(--ui-divider)] text-[var(--ui-text-muted)]"}`}>{label}</button>)}
    </div>
    {!funds.length ? <p className="text-sm text-[var(--ui-text-muted)]">{data.funds.length ? "No funds match this filter." : "No category comparison data available."}</p>
      : <ul aria-label="Category comparisons" className="grid gap-4 lg:grid-cols-2">{funds.map(fund => {
        const notice = fund.category_unavailable ? "Category data is not available for this fund."
          : fund.insufficient_history ? "Needs at least 3 years of history"
            : !fund.periods || Object.keys(fund.periods).length === 0 ? "Return comparisons are updating." : null;
        return <li key={fund.scheme_id} data-testid={`cat-row-${fund.scheme_id}`} className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 space-y-4">
          <div className="flex items-start gap-2.5">
            <span data-testid="fund-logo" aria-hidden="true"><SchemeLogo schemeName={fund.scheme_name} size="sm" /></span>
            <div className="min-w-0"><h4 className="text-sm font-semibold text-[var(--ui-text)]">{fund.scheme_name}</h4>
              <p className="text-xs text-[var(--ui-text-muted)]">{shortCategory(fund.sebi_category) || "Category not available"} · {fund.plan_type === "direct" ? "Direct plan" : fund.plan_type === "regular" ? "Regular plan" : "Plan not stated"}</p></div>
          </div>
          {notice ? <p className="text-xs text-[var(--ui-text-muted)]">{notice}</p> : <>
            <div className="space-y-4">{CATEGORY_PERIODS.map(period => <ComparisonRow key={period} fund={fund} period={period} scale={scale} />)}</div>
            <p className="text-xs text-[var(--ui-text-muted)]">Category average covers {fund.periods?.["1y"]?.peers ?? 0} funds (1Y), {fund.periods?.["3y"]?.peers ?? 0} (3Y), {fund.periods?.["5y"]?.peers ?? 0} (5Y).</p>
          </>}
        </li>;
      })}</ul>}
    <p className="text-xs text-[var(--ui-text-muted)]">Filled dot: your fund. Hollow dot: category average. Green means ahead; red means behind.</p>
  </div>;
}

export function CategoryRankingGroup() {
  const ranking = useMfAnalytics("category_ranking");
  return <SectionCard title={CARD_TITLES.category[0]} info="The simple average of funds in the same category and plan type. Each fund needs at least 3 years of history."
    state={ranking.status} onRetry={ranking.retry}>
    {ranking.data && <CategoryRankingBody data={ranking.data} />}
  </SectionCard>;
}
