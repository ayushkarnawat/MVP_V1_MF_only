import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { diffDecimalStrings } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, BarChart3, HelpCircle, Layers, TrendingUp } from "lucide-react";
import type {
  BenchmarkIndex,
  FundVsBenchmarkSummary,
  PortfolioBenchmarkSummary,
} from "./types";

export interface BenchmarkSectionProps {
  portfolioBenchmark: PortfolioBenchmarkSummary | null;
  fundBenchmark: FundVsBenchmarkSummary | null;
  isLoading?: boolean;
  className?: string;
}

const INDEX_LABELS: Record<BenchmarkIndex, string> = {
  nifty_50: "Nifty 50",
  nifty_500: "Nifty 500",
  nifty_largemidcap_250: "Nifty LargeMidcap 250",
  nifty_midcap_150: "Nifty Midcap 150",
};

function parseXirrNumber(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function formatXirrPercent(val: string | null): string {
  const num = parseXirrNumber(val);
  if (num === null) return "N/A";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function BenchmarkSection({
  portfolioBenchmark,
  fundBenchmark,
  isLoading = false,
  className,
}: BenchmarkSectionProps) {
  const [tab, setTab] = useState<"portfolio" | "funds">("portfolio");
  const [displayCount, setDisplayCount] = useState<number>(5);

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const portfolioXirrNum = parseXirrNumber(portfolioBenchmark?.portfolio_xirr ?? null);
  const benchmarkRows = portfolioBenchmark?.benchmarks ?? [];

  const fundRows = fundBenchmark?.funds ?? [];
  const hasFundRows = fundRows.length > 0;
  const visibleFundRows = fundRows.slice(0, displayCount);

  // Maximum XIRR for scaling bar width calculations (default floor 10%)
  const allXirrs = [
    portfolioXirrNum || 0,
    ...benchmarkRows.map((b) => parseXirrNumber(b.xirr) || 0),
    ...fundRows.flatMap((f) => [parseXirrNumber(f.fund_xirr) || 0, parseXirrNumber(f.benchmark_xirr) || 0]),
  ];
  const maxAbsXirr = Math.max(10, ...allXirrs.map((v) => Math.abs(v)));

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Benchmark Comparison (XIRR)
            </h2>
            <BarChart3 className="h-4 w-4 text-[var(--color-accent)]" />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Cash-flow timed performance benchmarking against broad market Nifty indices and scheme benchmarks
          </p>
        </div>

        {/* Tab Toggle: Portfolio vs Per Fund */}
        <div className="inline-flex items-center p-1 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs self-start sm:self-auto">
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer",
              tab === "portfolio"
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
            )}
            onClick={() => setTab("portfolio")}
          >
            Portfolio vs Broad Market
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer",
              tab === "funds"
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
            )}
            onClick={() => setTab("funds")}
          >
            Per-Fund vs Benchmark
          </button>
        </div>
      </div>

      {/* Tab 1: Portfolio Broad Market Comparison */}
      {tab === "portfolio" && (
        <div className="space-y-6">
          {/* Portfolio Hero Stat */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] block">
                Portfolio XIRR (Annualized Return)
              </span>
              {portfolioXirrNum !== null ? (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={cn(
                    "font-display text-3xl font-bold tabular-nums type-display",
                    portfolioXirrNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                  )}>
                    {formatXirrPercent(portfolioBenchmark?.portfolio_xirr ?? null)}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">p.a.</span>
                </div>
              ) : (
                <div className="py-1 mt-1">
                  <Badge variant="warning" className="text-xs font-semibold">
                    Insufficient Transaction History for XIRR
                  </Badge>
                </div>
              )}
            </div>

            <div className="text-xs text-[var(--color-text-secondary)] max-w-xs self-start sm:self-auto leading-relaxed border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--color-border)]/60">
              Computed via exact cash-flow timing (SIP/lump-sum transactions priced against index levels).
            </div>
          </div>

          {/* Grouped Bar Comparison Chart */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Portfolio XIRR vs Nifty Market Indices
            </h3>

            <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4 sm:p-5">
              {/* Portfolio Bar Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[var(--color-ink)] flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
                    <span>Your Portfolio XIRR</span>
                  </span>
                  <span className={cn(
                    "tabular-nums type-data font-bold",
                    portfolioXirrNum !== null && portfolioXirrNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-ink)]"
                  )}>
                    {formatXirrPercent(portfolioBenchmark?.portfolio_xirr ?? null)}
                  </span>
                </div>
                {portfolioXirrNum !== null ? (
                  <div className="h-3 w-full bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                    <div
                      className="h-full bg-[var(--color-accent)] transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(3, (Math.abs(portfolioXirrNum) / maxAbsXirr) * 100))}%` }}
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--color-text-secondary)] italic pt-0.5">
                    Requires transaction dates over a multi-month window to calculate XIRR.
                  </div>
                )}
              </div>

              <div className="h-px bg-[var(--color-border)] my-2" />

              {/* Benchmark Index Bars */}
              {benchmarkRows.map((bRow) => {
                const bNum = parseXirrNumber(bRow.xirr);
                const label = INDEX_LABELS[bRow.index] || bRow.index;
                const diffStr =
                  portfolioBenchmark?.portfolio_xirr != null && bRow.xirr !== null
                    ? diffDecimalStrings(portfolioBenchmark.portfolio_xirr, bRow.xirr)
                    : null;
                const diffVal = parseXirrNumber(diffStr);

                return (
                  <div key={bRow.index} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                        <span>{label}</span>
                        {diffVal !== null && (
                          <span className={cn(
                            "text-[10px] font-semibold flex items-center gap-0.5",
                            diffVal >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                          )}>
                            {diffVal >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {diffVal >= 0 ? `+${diffVal.toFixed(2)}%` : `${diffVal.toFixed(2)}%`}
                          </span>
                        )}
                      </span>
                      <span className="text-[var(--color-ink)] font-semibold tabular-nums type-data">
                        {formatXirrPercent(bRow.xirr)}
                      </span>
                    </div>

                    {bNum !== null ? (
                      <div className="h-2.5 w-full bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                        <div
                          className="h-full bg-[var(--color-text-secondary)]/50 transition-all duration-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(3, (Math.abs(bNum) / maxAbsXirr) * 100))}%` }}
                        />
                      </div>
                    ) : (
                      <div className="text-[10px] text-[var(--color-text-secondary)] italic">
                        Insufficient index history
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Per-Fund vs Appropriate Benchmark */}
      {tab === "funds" && (
        <div className="space-y-6">
          {/* Summary Line */}
          {fundBenchmark && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[var(--color-accent)]" />
                <span className="text-[var(--color-text-secondary)]">Overall Portfolio XIRR:</span>
                <span className="font-bold text-[var(--color-ink)] tabular-nums">
                  {formatXirrPercent(fundBenchmark.overall_portfolio_xirr)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-secondary)]">Broad Market (Nifty 500):</span>
                <span className="font-bold text-[var(--color-ink)] tabular-nums">
                  {formatXirrPercent(fundBenchmark.overall_broad_market_xirr)}
                </span>
              </div>
            </div>
          )}

          {!hasFundRows ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                No per-fund benchmark comparison available
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]/70 mt-1 max-w-sm">
                Import holdings with transaction history to evaluate individual scheme returns against assigned Nifty benchmarks.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleFundRows.map((fund) => {
                const fXirrNum = parseXirrNumber(fund.fund_xirr);
                const bXirrNum = parseXirrNumber(fund.benchmark_xirr);

                const benchLabel = INDEX_LABELS[fund.benchmark_index] || fund.benchmark_index;

                // Exact decimal-string subtraction using diffDecimalStrings
                const diffStr =
                  fund.fund_xirr !== null && fund.benchmark_xirr !== null
                    ? diffDecimalStrings(fund.fund_xirr, fund.benchmark_xirr)
                    : null;
                const diffNum = parseXirrNumber(diffStr);

                return (
                  <div
                    key={fund.scheme_id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 space-y-3"
                  >
                    {/* Fund & Benchmark Title Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">
                          {fund.scheme_name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                            Benchmark: <strong className="text-[var(--color-ink)] font-semibold">{benchLabel}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Difference Badge */}
                      {diffNum !== null && (
                        <div className="self-start sm:self-auto">
                          <Badge
                            variant={diffNum >= 0 ? "positive" : "outline"}
                            className={cn(
                              "text-xs font-bold gap-1 px-2.5 py-0.5",
                              diffNum >= 0
                                ? "bg-[var(--color-positive)]/10 text-[var(--color-positive)] border-[var(--color-positive)]/30"
                                : "text-[var(--color-negative)] border-[var(--color-negative)]/30"
                            )}
                          >
                            <TrendingUp className="h-3 w-3" />
                            <span>
                              {diffNum >= 0 ? `+${diffNum.toFixed(2)}% vs Benchmark` : `${diffNum.toFixed(2)}% vs Benchmark`}
                            </span>
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Comparative Bars */}
                    <div className="space-y-2 pt-1 border-t border-[var(--color-border)]/60">
                      {/* Fund Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="text-[var(--color-ink)] font-semibold">Fund XIRR</span>
                          <span className={cn(
                            "font-bold tabular-nums type-data",
                            fXirrNum !== null && fXirrNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-ink)]"
                          )}>
                            {formatXirrPercent(fund.fund_xirr)}
                          </span>
                        </div>
                        {fXirrNum !== null ? (
                          <div className="h-2.5 w-full bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                            <div
                              className="h-full bg-[var(--color-accent)] transition-all duration-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(3, (Math.abs(fXirrNum) / maxAbsXirr) * 100))}%` }}
                            />
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
                            <HelpCircle className="h-3 w-3 text-[var(--color-warning)]" />
                            <span>Insufficient history for fund XIRR</span>
                          </div>
                        )}
                      </div>

                      {/* Benchmark Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="text-[var(--color-text-secondary)]">Benchmark ({benchLabel})</span>
                          <span className="font-semibold text-[var(--color-text-secondary)] tabular-nums type-data">
                            {formatXirrPercent(fund.benchmark_xirr)}
                          </span>
                        </div>
                        {bXirrNum !== null ? (
                          <div className="h-2.5 w-full bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                            <div
                              className="h-full bg-[var(--color-text-secondary)]/40 transition-all duration-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(3, (Math.abs(bXirrNum) / maxAbsXirr) * 100))}%` }}
                            />
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
                            <HelpCircle className="h-3 w-3 text-[var(--color-warning)]" />
                            <span>Insufficient history for benchmark XIRR</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Show More / Show Less Pagination Control */}
              {fundRows.length > 5 && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setDisplayCount((prev) => (prev >= fundRows.length ? 5 : prev + 5))}
                    className="text-xs font-semibold text-[var(--color-accent)] hover:underline cursor-pointer px-4 py-2 rounded-lg hover:bg-[var(--color-bg)] transition-colors"
                  >
                    {displayCount >= fundRows.length ? "Show Less" : `Show More (${fundRows.length - visibleFundRows.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
