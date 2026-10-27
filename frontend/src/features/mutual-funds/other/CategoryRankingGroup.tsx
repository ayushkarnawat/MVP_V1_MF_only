import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import type { CategoryRankingSummary, PeriodReturn } from "../types";
import {
  categoryOutperform,
  ordinal,
  percentileTier,
  percentileWidth,
  pointsText,
  rawPercent,
  TIER_STYLE,
  wholePercentile,
} from "./otherLogic";

export interface PeriodTableProps {
  name: string;
  periods?: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>>;
}

export function PeriodTable({ name, periods }: PeriodTableProps) {
  if (!periods || Object.keys(periods).length === 0) {
    return null;
  }

  const p1y = periods["1y"];
  const p3y = periods["3y"];
  const p5y = periods["5y"];

  return (
    <div className="overflow-x-auto space-y-2">
      <table aria-label={`${name} returns by period`} className="w-full text-left text-xs">
        <caption className="text-left text-xs text-[var(--ui-text-muted)] pb-2">
          Category average covers {p1y?.peers ?? 0} funds (1Y), {p3y?.peers ?? 0} (3Y), {p5y?.peers ?? 0} (5Y).
        </caption>
        <thead>
          <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
            <th scope="col" className="py-2 px-3 font-medium">Return</th>
            <th scope="col" className="py-2 px-3 font-medium">1Y</th>
            <th scope="col" className="py-2 px-3 font-medium">3Y</th>
            <th scope="col" className="py-2 px-3 font-medium">5Y</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--ui-divider)]">
            <th scope="row" className="py-2 px-3 font-medium text-[var(--ui-text)]">Fund</th>
            <td data-testid="fund-1y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p1y?.fund_return)}</td>
            <td data-testid="fund-3y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p3y?.fund_return)}</td>
            <td data-testid="fund-5y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p5y?.fund_return)}</td>
          </tr>
          <tr className="border-b border-[var(--ui-divider)]">
            <th scope="row" className="py-2 px-3 font-medium text-[var(--ui-text)]">Category average</th>
            <td data-testid="category-1y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p1y?.category_avg)}</td>
            <td data-testid="category-3y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p3y?.category_avg)}</td>
            <td data-testid="category-5y" className="py-2 px-3 text-[var(--ui-text)]">{rawPercent(p5y?.category_avg)}</td>
          </tr>
          <tr>
            <th scope="row" className="py-2 px-3 font-medium text-[var(--ui-text)]">Difference</th>
            <td data-testid="difference-1y" className="py-2 px-3 font-medium text-[var(--ui-text)]">
              {pointsText(p1y?.fund_return, p1y?.category_avg)}
            </td>
            <td data-testid="difference-3y" className="py-2 px-3 font-medium text-[var(--ui-text)]">
              {pointsText(p3y?.fund_return, p3y?.category_avg)}
            </td>
            <td data-testid="difference-5y" className="py-2 px-3 font-medium text-[var(--ui-text)]">
              {pointsText(p5y?.fund_return, p5y?.category_avg)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CategoryRankingBody({ data }: { data: CategoryRankingSummary }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId !== null && !data.funds.some(f => f.scheme_id === openId)) {
    setOpenId(null);
  }

  return (
    <div data-testid="category-body" className="space-y-4">
      <p className="text-xs text-[var(--ui-text-muted)]">
        Ranked on the blended 3Y/5Y return. Click a fund to see its full 1Y/3Y/5Y return vs. its category.
      </p>

      {data.funds.length === 0 ? (
        <p className="text-sm text-[var(--ui-text-muted)]">No category ranking data available</p>
      ) : (
        <ul aria-label="Category ranking" className="space-y-2">
          {data.funds.map(fund => {
            if (fund.category_unavailable || fund.insufficient_history) {
              const state = fund.category_unavailable ? "unavailable" : "insufficient";
              return (
                <li
                  key={fund.scheme_id}
                  data-testid={`cat-row-${fund.scheme_id}`}
                  data-state={state}
                  className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-2 opacity-75"
                >
                  <div className="flex items-center gap-2.5">
                    <span data-testid="fund-logo" aria-hidden="true">
                      <SchemeLogo schemeName={fund.scheme_name} size="sm" />
                    </span>
                    <span className="font-semibold text-xs text-[var(--ui-text)]">{fund.scheme_name}</span>
                    <span className="rounded bg-[var(--ui-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-text-muted)] border border-[var(--ui-divider)]">
                      {fund.category_unavailable ? "Category Unavailable" : "Insufficient History"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ui-text-muted)]">
                    {fund.category_unavailable
                      ? "SEBI category data is not available for this fund scheme to compute rank positioning."
                      : "Fund has insufficient historical NAV records to meet category ranking requirements."}
                  </p>
                </li>
              );
            }

            const isOpen = openId === fund.scheme_id;
            const tier =
              fund.percentile !== null && fund.percentile !== undefined
                ? percentileTier(fund.percentile)
                : null;
            const outperform = categoryOutperform(fund);

            return (
              <li
                key={fund.scheme_id}
                data-testid={`cat-item-${fund.scheme_id}`}
                className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] transition-colors hover:bg-[var(--ui-row-hover)]"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  data-testid={`cat-row-${fund.scheme_id}`}
                  data-tier={tier ?? "none"}
                  data-clickable=""
                  data-effect="expand"
                  onClick={() => setOpenId(isOpen ? null : fund.scheme_id)}
                  className="flex w-full flex-col gap-2 p-3 text-left"
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        data-testid={`cat-badge-${fund.scheme_id}`}
                        style={
                          tier
                            ? { backgroundColor: TIER_STYLE[tier].bg, color: TIER_STYLE[tier].text }
                            : undefined
                        }
                        className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                      >
                        #{fund.category_rank ?? "—"}
                      </span>
                      <span data-testid="fund-logo" aria-hidden="true">
                        <SchemeLogo schemeName={fund.scheme_name} size="sm" />
                      </span>
                      <span title={fund.scheme_name} className="truncate text-xs font-semibold text-[var(--ui-text)]">
                        {fund.scheme_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {fund.percentile !== null && fund.percentile !== undefined && tier && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--ui-divider)]">
                            <span
                              data-testid={`cat-fill-${fund.scheme_id}`}
                              data-tier={tier}
                              style={{
                                width: `${percentileWidth(fund.percentile)}%`,
                                backgroundColor: TIER_STYLE[tier].fill,
                              }}
                              className="block h-full rounded-full transition-all"
                            />
                          </div>
                          <span
                            data-testid={`cat-pct-${fund.scheme_id}`}
                            style={{ color: TIER_STYLE[tier].text }}
                            className="text-xs font-semibold"
                          >
                            {ordinal(wholePercentile(fund.percentile))} pct · Top {100 - wholePercentile(fund.percentile)}%
                          </span>
                        </div>
                      )}
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ui-text-muted)]">
                    <span>
                      {fund.sebi_category ?? "Unclassified Category"} · rank {fund.category_rank} of {fund.category_size}
                    </span>
                    {(fund.plan_type === "direct" || fund.plan_type === "regular") && (
                      <>
                        <span>·</span>
                        <span>Compared with {fund.plan_type === "direct" ? "Direct" : "Regular"} plan peers</span>
                      </>
                    )}
                    {fund.thin_category && (
                      <span
                        data-testid={`cat-thin-${fund.scheme_id}`}
                        className="rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn-text)]"
                      >
                        Thin Category ({fund.category_size} peers)
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div data-testid={`cat-detail-${fund.scheme_id}`} className="border-t border-[var(--ui-divider)] p-4 space-y-3">
                    <PeriodTable name={fund.scheme_name} periods={fund.periods} />
                    {outperform && (
                      <p data-testid={`cat-outperform-${fund.scheme_id}`} className="text-xs font-medium text-[var(--ui-text)]">
                        {outperform}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CategoryRankingGroup() {
  const ranking = useMfAnalytics("category_ranking");

  return (
    <SectionCard
      title="Category Rank"
      info="Where each fund sits among every other fund SEBI classifies in the same category."
      state={ranking.status}
      onRetry={ranking.retry}
    >
      {ranking.data && <CategoryRankingBody data={ranking.data} />}
    </SectionCard>
  );
}
