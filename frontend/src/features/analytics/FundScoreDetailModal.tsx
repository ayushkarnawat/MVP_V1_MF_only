import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getFundScore } from "./api";
import type { FundScoreRow } from "./types";
import { AlertCircle, CheckCircle2, ShieldAlert, Sparkles, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FundScoreDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemeId: string | null;
  schemeName?: string;
  initialData?: FundScoreRow | null;
}

function parseScore(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

export function FundScoreDetailModal({
  isOpen,
  onClose,
  schemeId,
  schemeName,
  initialData = null,
}: FundScoreDetailModalProps) {
  const [data, setData] = useState<FundScoreRow | null>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !schemeId) return;

    if (initialData && initialData.scheme_id === schemeId) {
      setData(initialData);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getFundScore(schemeId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load fund score details");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, schemeId, initialData]);

  if (!isOpen) return null;

  const finalScoreNum = parseScore(data?.final_score ?? null);
  const returnPct = parseScore(data?.return_percentile ?? null);
  const riskPct = parseScore(data?.risk_percentile ?? null);
  const consistencyPct = parseScore(data?.consistency_hit_rate ?? null);
  const costAdjNum = parseScore(data?.cost_adjustment ?? null);

  const tier = data?.risk_adjusted_tier ?? null;
  const displayName = data?.scheme_name || schemeName || "Fund Score Detail";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 bg-[var(--color-surface)] border-[var(--color-border)]">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-[var(--color-accent)] border-[var(--color-accent)]/30">
              S20 · Unifolio Fund Score
            </Badge>
            {data?.thin_category && (
              <Badge variant="warning" className="text-[10px]">
                Thin Category
              </Badge>
            )}
          </div>
          <DialogTitle className="font-display text-lg font-bold text-[var(--color-ink)] leading-snug">
            {displayName}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
            Comprehensive quality verdict relative to true SEBI category peers
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-4 text-center space-y-2 my-2">
            <AlertCircle className="h-6 w-6 text-[var(--color-negative)] mx-auto" />
            <p className="text-xs font-bold text-[var(--color-ink)]">Score Load Error</p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6 pt-2">
            {/* Score & Tier Header Card */}
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

                {/* 5-Tier Visual Band Indicator */}
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

            {/* The Three Core Methodology Ingredients */}
            {!data.category_unavailable && !data.insufficient_history && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                  <span>The 3 Core Methodology Ingredients</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Ingredient 1: Return (45%) */}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                      <span>Return</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">
                        45% Wt
                      </Badge>
                    </div>
                    <div>
                      <span className="font-display text-xl font-bold text-[var(--color-ink)] tabular-nums type-data">
                        {returnPct !== null ? `${returnPct.toFixed(1)}%` : "N/A"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">
                        Category Return Percentile
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                      Medium/long-term CAGR growth vs category peers.
                    </p>
                  </div>

                  {/* Ingredient 2: Downside Risk (30%) */}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                      <span>Risk</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">
                        30% Wt
                      </Badge>
                    </div>
                    <div>
                      <span className="font-display text-xl font-bold text-[var(--color-positive)] tabular-nums type-data">
                        {riskPct !== null ? `${riskPct.toFixed(1)}%` : "N/A"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">
                        Downside Deviation Grade
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                      Downside-only loss protection in bad months.
                    </p>
                  </div>

                  {/* Ingredient 3: Consistency (25%) */}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
                      <span>Consistency</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-[var(--color-border)]">
                        25% Wt
                      </Badge>
                    </div>
                    <div>
                      <span className="font-display text-xl font-bold text-[var(--color-accent)] tabular-nums type-data">
                        {consistencyPct !== null ? `${consistencyPct.toFixed(1)}%` : "N/A"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-secondary)] block mt-0.5">
                        12M Rolling Beat Rate
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--color-text-secondary)]/80 leading-relaxed border-t border-[var(--color-border)]/60 pt-1.5">
                      Frequency of beating category median over 12M windows.
                    </p>
                  </div>
                </div>

                {/* Cost Adjustment Nudge Row */}
                {costAdjNum !== null && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3 flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      <span>TER Fee Cost Adjustment Nudge:</span>
                    </span>
                    <span className={cn(
                      "font-bold tabular-nums type-data",
                      costAdjNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                    )}>
                      {costAdjNum >= 0 ? `+${costAdjNum.toFixed(2)} pts (Low Fee Bonus)` : `${costAdjNum.toFixed(2)} pts (High Fee Penalty)`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Transparency Footnote */}
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
