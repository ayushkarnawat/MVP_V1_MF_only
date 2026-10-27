import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import type { FundRankingRow, FundRankingSummary } from "../types";
import { PeriodTable } from "./CategoryRankingGroup";
import {
  componentText,
  percentileTier,
  percentileWidth,
  RANK_WEIGHTS,
  rankLine,
  rankWeightsSentence,
  rawPercent,
  shortCategory,
  splitNeighbors,
  terText,
  TIER_STYLE,
} from "./otherLogic";

interface RankRowProps {
  fund: FundRankingRow;
  isOpen: boolean;
  onToggle: () => void;
}

function RankRow({ fund, isOpen, onToggle }: RankRowProps) {
  // 1. category_unavailable
  if (fund.category_unavailable) {
    return (
      <li
        data-testid={`rank-row-${fund.scheme_id}`}
        data-state="unavailable"
        className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span data-testid="fund-logo" aria-hidden="true">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
            </span>
            <span title={fund.scheme_name} className="truncate text-sm font-semibold text-[var(--ui-text)]">
              {fund.scheme_name}
            </span>
          </div>
          <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-[var(--ui-divider)] text-[var(--ui-text-muted)]">
            Category Unavailable
          </span>
        </div>
      </li>
    );
  }

  // 2. insufficient_history
  if (fund.insufficient_history) {
    return (
      <li
        data-testid={`rank-row-${fund.scheme_id}`}
        data-state="insufficient"
        className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 shadow-sm space-y-2"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span data-testid="fund-logo" aria-hidden="true">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
            </span>
            <span title={fund.scheme_name} className="truncate text-sm font-semibold text-[var(--ui-text)]">
              {fund.scheme_name}
            </span>
          </div>
          <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-[var(--ui-divider)] text-[var(--ui-text-muted)]">
            Insufficient History
          </span>
        </div>
        <p className="text-xs text-[var(--ui-text-muted)]">
          Not ranked yet — needs 3 years of NAV history to be eligible.
        </p>
      </li>
    );
  }

  // 3. too_few_peers
  if (fund.too_few_peers) {
    const n = fund.category_size;
    const planLine =
      fund.plan_type === "direct"
        ? "Compared with Direct plan peers"
        : fund.plan_type === "regular"
          ? "Compared with Regular plan peers"
          : null;

    return (
      <li
        data-testid={`rank-row-${fund.scheme_id}`}
        data-state="too-few-peers"
        className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span data-testid="fund-logo" aria-hidden="true">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
            </span>
            <span title={fund.scheme_name} className="truncate text-sm font-semibold text-[var(--ui-text)]">
              {fund.scheme_name}
            </span>
          </div>
          <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-[var(--ui-divider)] text-[var(--ui-text-muted)]">
            Not enough peers
          </span>
        </div>

        <p className="text-xs text-[var(--ui-text-muted)]">
          Not enough peers to rank: {n} {n === 1 ? "fund" : "funds"} in this category {n === 1 ? "has" : "have"} a 3-year record ({fund.category_universe_size} in category).
        </p>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span data-testid={`rank-own-${fund.scheme_id}`} className="font-medium text-[var(--ui-text)]">
            3Y return {rawPercent(fund.components?.return_3y?.raw)} · Expense ratio {terText(fund.components?.low_ter?.raw)}
          </span>
          {planLine && (
            <span className="text-[var(--ui-text-muted)]">{planLine}</span>
          )}
        </div>

        {fund.horizons && <PeriodTable name={fund.scheme_name} periods={fund.horizons} />}
      </li>
    );
  }

  // 4. ranked fund
  const tier = fund.composite_score ? percentileTier(fund.composite_score) : null;
  const planLine =
    fund.plan_type === "direct"
      ? "Compared with Direct plan peers"
      : fund.plan_type === "regular"
        ? "Compared with Regular plan peers"
        : null;

  const { above, below } = splitNeighbors(fund);

  return (
    <li
      data-testid={`rank-item-${fund.scheme_id}`}
      className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm overflow-hidden"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        data-testid={`rank-row-${fund.scheme_id}`}
        data-clickable=""
        data-effect="expand"
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-[var(--ui-hover)] transition-colors space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              data-testid={`rank-badge-${fund.scheme_id}`}
              data-tier={tier ?? "none"}
              style={
                tier
                  ? { backgroundColor: TIER_STYLE[tier].bg, color: TIER_STYLE[tier].text }
                  : undefined
              }
              className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            >
              #{fund.category_rank}
            </span>
            <span data-testid="fund-logo" aria-hidden="true">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
            </span>
            <span title={fund.scheme_name} className="truncate text-sm font-semibold text-[var(--ui-text)]">
              {fund.scheme_name}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              data-testid={`rank-composite-${fund.scheme_id}`}
              className="text-xs font-semibold text-[var(--ui-text)]"
            >
              Composite {fund.composite_score ? fund.composite_score : "—"}/100
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-muted)]">
          {fund.category_name && <span>{fund.category_name}</span>}
          {fund.ranked_as && <span>· Ranked on {fund.ranked_as}</span>}
          {planLine && <span>· {planLine}</span>}
          {fund.thin_category && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-[var(--warn-bg)] text-[var(--warn-text)]">
              Thin Category ({fund.category_size} peers)
            </span>
          )}
        </div>

        <div className="text-xs text-[var(--ui-text-muted)]">
          <span data-testid={`rank-line-${fund.scheme_id}`}>{rankLine(fund)}</span>
        </div>
      </button>

      {isOpen && (
        <div
          data-testid={`rank-detail-${fund.scheme_id}`}
          className="border-t border-[var(--ui-divider)] bg-[var(--ui-card-subtle)] p-4 space-y-4"
        >
          {fund.thin_category && (
            <p data-testid={`rank-thin-${fund.scheme_id}`} className="text-xs text-[var(--warn-text)]">
              Only {fund.category_size} {shortCategory(fund.category_name)} funds have a 3-year record, so this compares your fund with very few others.
            </p>
          )}

          <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">
              Leaderboard neighbors
            </h5>
            <ul aria-label="Leaderboard neighbors" className="divide-y divide-[var(--ui-divider)] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card)] text-xs">
              {above.map(n => (
                <li
                  key={n.scheme_id}
                  data-testid={`neighbor-${n.scheme_id}`}
                  className="flex items-center justify-between p-2.5 text-[var(--ui-text)]"
                ><span>#{n.category_rank} {n.scheme_name}</span><span>{n.composite_score ? n.composite_score : "—"}/100</span></li>
              ))}
              <li
                data-testid="neighbor-you"
                data-you="true"
                className="flex items-center justify-between p-2.5 font-semibold bg-[var(--ui-hover)] text-[var(--ui-text)]"
              ><span>#{fund.category_rank} {fund.scheme_name} (this fund)</span><span>{fund.composite_score ? fund.composite_score : "—"}/100</span></li>
              {below.map(n => (
                <li
                  key={n.scheme_id}
                  data-testid={`neighbor-${n.scheme_id}`}
                  className="flex items-center justify-between p-2.5 text-[var(--ui-text)]"
                ><span>#{n.category_rank} {n.scheme_name}</span><span>{n.composite_score ? n.composite_score : "—"}/100</span></li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">
              Component percentile within category
            </h5>
            <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card)] p-3">
              {RANK_WEIGHTS.map(rw => {
                const comp = fund.components?.[rw.key as keyof typeof fund.components];
                const pct = comp?.percentile;
                const compTier = pct !== null && pct !== undefined ? percentileTier(pct) : null;
                const width = pct !== null && pct !== undefined ? percentileWidth(pct) : "0";
                return (
                  <div
                    key={rw.key}
                    data-testid={`comp-${rw.key}-${fund.scheme_id}`}
                    data-tier={compTier ?? "none"}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                  >
                    <span className="font-medium text-[var(--ui-text)]">{rw.label} ({rw.weight}%)</span>
                    <div className="flex items-center gap-3">
                      {pct !== null && pct !== undefined && (
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ui-divider)]">
                          <span
                            data-testid={`comp-fill-${rw.key}-${fund.scheme_id}`}
                            style={{
                              width: `${width}%`,
                              backgroundColor: compTier ? TIER_STYLE[compTier].fill : undefined,
                            }}
                            className="block h-full rounded-full transition-all"
                          />
                        </div>
                      )}
                      <span className="text-[var(--ui-text-muted)] shrink-0">
                        {comp ? componentText(comp, rw.unit as "fraction" | "percent") : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {fund.horizons && <PeriodTable name={fund.scheme_name} periods={fund.horizons} />}
        </div>
      )}
    </li>
  );
}

export function FundRankingBody({ data }: { data: FundRankingSummary }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!data.funds || data.funds.length === 0) {
    return (
      <div className="p-4 text-center text-sm" style={{ color: "var(--muted-text)" }}>
        No fund ranking data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p data-testid="rank-weights" className="text-xs text-[var(--ui-text-muted)]">
        {rankWeightsSentence()} Click a fund to see its leaderboard neighbors and component breakdown.
      </p>
      <ul aria-label="Fund ranking" className="space-y-3">
        {data.funds.map(fund => (
          <RankRow
            key={fund.scheme_id}
            fund={fund}
            isOpen={openId === fund.scheme_id}
            onToggle={() =>
              setOpenId(cur => (cur === fund.scheme_id ? null : fund.scheme_id))
            }
          />
        ))}
      </ul>
    </div>
  );
}

export function FundRankingGroup() {
  const ranking = useMfAnalytics("ranking");

  return (
    <SectionCard
      title="Fund Leaderboard"
      info="Each fund's rank in its category on a transparent formula, with the funds just above and below it."
      state={ranking.status}
      onRetry={ranking.retry}
    >
      {ranking.data && <FundRankingBody data={ranking.data} />}
    </SectionCard>
  );
}
