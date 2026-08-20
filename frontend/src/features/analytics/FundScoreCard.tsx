import { Badge } from "@/components/ui/badge";
import type { FundScoreRow } from "./types";
import { ShieldAlert, Info, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FundScoreCardProps {
  data: FundScoreRow;
}

function parseScore(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

export function FundScoreCard({ data }: FundScoreCardProps) {
  const finalScoreNum = parseScore(data.final_score);
  const returnPct = parseScore(data.return_percentile);
  const riskPct = parseScore(data.risk_percentile);
  const consistencyPct = parseScore(data.consistency_hit_rate);
  const costAdjNum = parseScore(data.cost_adjustment);
  const tier = data.risk_adjusted_tier;

  return (
    <div className="space-y-6 pt-2">
      {data.category_unavailable ? (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-[var(--color-warning)] flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-[var(--color-ink)]">Category Data Unavailable</p>
            <p className="text-[var(--color-text-secondary)]">
              This scheme cannot be scored because SEBI category classification data is not available.
            </p>
          </div>
        </div>
      ) : data.insufficient_history ? (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4 flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--color-warning)] flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-[var(--color-ink)]">Insufficient Track Record</p>
            <p className="text-[var(--color-text-secondary)]">
              This fund does not have enough historical NAV data to evaluate downside risk and 12-month rolling consistency.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider block">
                Overall Unifolio Score
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-3xl font-bold text-[var(--color-ink)] tabular-nums type-display">
                  {finalScoreNum !== null ? finalScoreNum.toFixed(1) : "N/A"}
                </span>
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">/ 100</span>
              </div>
            </div>
            {tier !== null && (
              <div className="text-right">
                <Badge className="bg-[var(--color-accent)] text-white font-bold text-xs px-3 py-1 shadow-xs">
                  Tier {tier} of 5
                </Badge>
                <span className="text-[10px] text-[var(--color-text-secondary)] block mt-1">
                  {tier >= 4 ? "Top Tier Performer" : tier === 3 ? "Average Category Rank" : "Below Category Average"}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)] font-medium">
              <span>Tier 1 (Lower)</span>
              <span>Tier 3</span>
              <span>Tier 5 (Top 20%)</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((t) => {
                const isActive = tier === t;
                const isPassed = tier !== null && tier >= t;
                return (
                  <div
                    key={t}
                    className={cn(
                      "h-2.5 rounded-full transition-all duration-300",
                      isActive
                        ? "bg-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30 ring-offset-1"
                        : isPassed
                        ? "bg-[var(--color-accent)]/50"
                        : "bg-[var(--color-border)]"
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!data.category_unavailable && !data.insufficient_history && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>The 3 Core Methodology Ingredients</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                <span>Return</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">45% Wt</Badge>
              </div>
              <div>
                <span className="font-display text-xl font-bold text-[var(--color-ink)] tabular-nums type-data">
                  {returnPct !== null ? `${returnPct.toFixed(1)}%` : "N/A"}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">Category Return Percentile</span>
              </div>
              <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                Medium/long-term CAGR growth vs category peers.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                <span>Risk</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">30% Wt</Badge>
              </div>
              <div>
                <span className="font-display text-xl font-bold text-[var(--color-positive)] tabular-nums type-data">
                  {riskPct !== null ? `${riskPct.toFixed(1)}%` : "N/A"}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">Downside Deviation Grade</span>
              </div>
              <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                Downside-only loss protection in bad months.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                <span>Consistency</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">25% Wt</Badge>
              </div>
              <div>
                <span className="font-display text-xl font-bold text-[var(--color-accent)] tabular-nums type-data">
                  {consistencyPct !== null ? `${consistencyPct.toFixed(1)}%` : "N/A"}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">12M Rolling Beat Rate</span>
              </div>
              <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                Frequency of beating category median over 12M windows.
              </p>
            </div>
          </div>
          {costAdjNum !== null && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <span>TER Fee Cost Adjustment Nudge:</span>
              </span>
              <span className={cn("font-bold tabular-nums type-data", costAdjNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]")}>
                {costAdjNum >= 0 ? `+${costAdjNum.toFixed(2)} pts (Low Fee Bonus)` : `${costAdjNum.toFixed(2)} pts (High Fee Penalty)`}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-bg)]/30 p-3.5 text-[11px] text-[var(--color-text-secondary)] space-y-1">
        <p className="font-bold text-[var(--color-ink)] flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-positive)]" />
          <span>Transparent Methodology Commitment</span>
        </p>
        <p className="leading-relaxed">
          Unifolio Fund Scores are modeling judgments built on historical data using a fixed 45% Return / 30% Downside Risk / 25% Consistency formula with TER fee nudges. They are comparative analytical insights, not regulated investment advice or guarantees.
        </p>
      </div>
    </div>
  );
}
