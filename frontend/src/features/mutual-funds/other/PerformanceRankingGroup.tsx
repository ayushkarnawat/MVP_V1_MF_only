import { SchemeLogo } from "../../../components/SchemeLogo";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import type { PeriodRank, PerformancePeriod, PerformanceRankingFund, PerformanceRankingResult } from "../types";
import { PERFORMANCE_PERIODS, isPerformanceRanking, performanceRankBanner, performanceRankColor, performanceRankPosition, shortCategory } from "./otherLogic";

const PERIOD_LABELS: Record<PerformancePeriod, string> = { "1Y": "1 year", "3Y": "3 years", "5Y": "5 years" };

function RankCell({ fund, period, value }: { fund: PerformanceRankingFund; period: PerformancePeriod; value: PeriodRank | undefined }) {
  const ranked = value?.status === "ranked" && value.rank !== null && value.total > 0;
  if (!ranked || value === undefined || value.rank === null) {
    const reason = !fund.plan_type ? "Plan type is not available yet." : !fund.sebi_category ? "Category is not available yet."
      : `Not enough history for ${PERIOD_LABELS[period]}.`;
    return <td data-testid={`rank-cell-${fund.scheme_id}-${period}`} className="px-4 py-5 align-top text-xs text-[var(--ui-text-muted)]">
      <span className="text-2xl">—</span><p className="mt-2">{reason}</p>
    </td>;
  }
  const position = performanceRankPosition(value.rank, value.total);
  const color = performanceRankColor(value.rank, value.total);
  return <td data-testid={`rank-cell-${fund.scheme_id}-${period}`} aria-label={`${PERIOD_LABELS[period]}: ${value.rank} out of ${value.total}`}
    className="px-4 py-5 align-top">
    <div className="tabular-nums" style={{ color }}>
      <span data-testid={`rank-number-${fund.scheme_id}-${period}`} className="text-2xl font-semibold leading-none">{value.rank}</span>
      <span data-testid={`rank-total-${fund.scheme_id}-${period}`} className="text-xs text-[var(--ui-text-muted)]">/{value.total}</span>
    </div>
    <div aria-hidden="true" className="relative mt-3 h-1.5 rounded-full bg-[var(--ui-divider)]">
      <span className="absolute inset-y-0 left-0 w-1/4 rounded-l-full bg-[var(--pos-bg)]" />
      <span data-testid={`rank-dot-${fund.scheme_id}-${period}`} data-position={position}
        className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-2 ring-[var(--ui-card)]"
        style={{ left: `${position}%`, backgroundColor: color }} />
    </div>
  </td>;
}

export function PerformanceRankingContent({ data }: { data: PerformanceRankingResult }) {
  return <div className="space-y-4">
    <p className="rounded-xl bg-[var(--pos-bg)] p-4 text-sm text-[var(--ui-text)]">{performanceRankBanner(data)}</p>
    {data.funds.length === 0 ? <p className="text-sm text-[var(--ui-text-muted)]">No funds to rank for this selection.</p> :
      <div className="overflow-x-auto"><table aria-label="Performance rankings" className="w-full min-w-[640px] table-fixed text-left">
        <thead className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
          <tr><th scope="col" className="w-2/5 px-4 py-3">Fund</th>{PERFORMANCE_PERIODS.map(period => <th key={period} scope="col" className="px-4 py-3">{PERIOD_LABELS[period]}</th>)}</tr>
        </thead>
        <tbody>{data.funds.map(fund => {
          const index = fund.disclaimer_key === "index_fund_not_ranked" || PERFORMANCE_PERIODS.every(period => fund.periods?.[period]?.status === "not_ranked_index_fund");
          return <tr key={fund.scheme_id} data-testid={`performance-row-${fund.scheme_id}`} className="border-b border-[var(--ui-divider)]">
            <th scope="row" className="px-4 py-5 align-top font-normal">
              <div className="flex items-start gap-2">
                <span data-testid="performance-fund-logo" aria-hidden="true"><SchemeLogo schemeName={fund.scheme_name} size="sm" /></span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-[var(--ui-text)]">{fund.scheme_name}</p>
                  <p className="text-xs text-[var(--ui-text-muted)]">{shortCategory(fund.sebi_category ?? null) || "Category not available"}</p>
                  <p className="text-xs text-[var(--ui-text-muted)]">{fund.plan_type === "direct" ? "Direct" : fund.plan_type === "regular" ? "Regular" : "Plan not stated"}</p>
                  {fund.ranked_as && <p className="text-xs text-[var(--ui-text-muted)]">Compared using {fund.ranked_as}.</p>}
                </div>
              </div>
            </th>
            {index ? <td colSpan={3} className="px-4 py-5 text-xs text-[var(--ui-text-muted)]">Index funds are not ranked here. Their comparison with the index they track is shown in the benchmark comparison.</td>
              : PERFORMANCE_PERIODS.map(period => <RankCell key={period} fund={fund} period={period} value={fund.periods?.[period]} />)}
          </tr>;
        })}</tbody>
      </table></div>}
    <p className="text-xs text-[var(--ui-text-muted)]">Ranks may differ between periods because funds need enough history for each period. Direct and Regular plans are compared separately.</p>
  </div>;
}

export function PerformanceRankingGroup() {
  const { data, status, retry, updating } = useMfAnalytics("ranking");
  const old = updating || (data !== null && !isPerformanceRanking(data));
  return <SectionCard title="Rank in your fund's category" state={status} onRetry={retry}>
    {old ? <p role="status" aria-label="Updating Performance Ranking" className="text-sm text-[var(--ui-text-muted)]">Performance rankings are updating.</p>
      : data ? <PerformanceRankingContent data={data} /> : <p className="text-sm text-[var(--ui-text-muted)]">No performance ranking data available.</p>}
  </SectionCard>;
}
