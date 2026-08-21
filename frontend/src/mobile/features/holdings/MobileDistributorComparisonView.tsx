import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, toTitleCase } from "@/lib/utils";
import { getAggregateDistributorComparison, getMemberDistributorComparison } from "@/features/dashboard/api";
import type { DistributorPortfolioRow } from "@/features/dashboard/types";

export interface MobileDistributorComparisonViewProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: "aggregate" | "member";
  memberId: string | null;
}

function rowKey(row: DistributorPortfolioRow, idx: number): string {
  return row.arn_code || `direct-${idx}`;
}

/** Mobile full-screen equivalent of DistributorComparisonModal — portfolio-
 * wide, same fetch source (getMemberDistributorComparison /
 * getAggregateDistributorComparison) as desktop, but built around the
 * mobile shell's own card idiom: each distributor is a card that expands
 * in place to reveal its per-scheme breakdown, rather than a table. */
export function MobileDistributorComparisonView({
  isOpen,
  onClose,
  viewMode,
  memberId,
}: MobileDistributorComparisonViewProps) {
  const [rows, setRows] = useState<DistributorPortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    if (viewMode === "member" && !memberId) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setExpanded(new Set());

    const fetchRows = viewMode === "aggregate"
      ? getAggregateDistributorComparison(controller.signal).then((res) => res.rows)
      : getMemberDistributorComparison(memberId as string, controller.signal);

    fetchRows
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err.message || "Failed to load distributor comparison");
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, viewMode, memberId]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col min-h-dvh bg-[var(--color-bg)] animate-in fade-in duration-200">
      {/* Top Header with Back Navigation */}
      <header className="sticky top-0 z-30 w-full h-14 bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)] px-4 grid grid-cols-3 items-center transition-colors duration-200 select-none">
        <div className="flex items-center justify-start">
          <button
            onClick={onClose}
            className="h-11 w-11 -ml-2 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            type="button"
            aria-label="Back to holdings"
          >
            <ChevronLeft className="h-6 w-6 stroke-[2.2]" />
          </button>
        </div>

        <div className="flex items-center justify-center text-center">
          <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] truncate">
            DISTRIBUTOR COMPARISON
          </h1>
        </div>

        <div />
      </header>

      {/* Main Content View */}
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Compare returns across Direct plans and Regular distributors, across every fund you hold
          </p>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)]">
            <p className="text-xs text-[var(--color-negative)]">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">
            No distributor comparison data found.
          </p>
        ) : (
          <div className="space-y-2.5">
            {rows.map((row, idx) => {
              const key = rowKey(row, idx);
              const isDirect = !row.arn_code;
              const gain = parseFloat(row.unrealized_gain || "0");
              const isPositive = gain >= 0;
              const isExpanded = expanded.has(key);

              return (
                <div
                  key={key}
                  className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(key)}
                    aria-expanded={isExpanded}
                    className="w-full text-left p-4 space-y-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)] transition-transform duration-150",
                            isExpanded && "rotate-90"
                          )}
                        />
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-[var(--color-ink)] truncate block">
                            {isDirect
                              ? "Direct Plan (No Broker)"
                              : row.distributor_name || "Regular Broker"}
                          </span>
                          {!isDirect && (
                            <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                              ARN: {row.arn_code}
                            </span>
                          )}
                        </div>
                      </div>

                      {isDirect ? (
                        <Badge variant="positive">Direct</Badge>
                      ) : row.arn_status === "ACTIVE" ? (
                        <Badge variant="positive">{toTitleCase(row.arn_status)}</Badge>
                      ) : row.arn_status === "SUSPENDED" || row.arn_status === "INVALID" ? (
                        <Badge variant="warning">{toTitleCase(row.arn_status)}</Badge>
                      ) : (
                        <Badge variant="neutral">Unresolved</Badge>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-[var(--color-border)]/60 grid grid-cols-3 gap-2 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wide block">
                          Invested
                        </span>
                        <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                          ₹{formatCurrency(row.amount_invested)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wide block">
                          Current
                        </span>
                        <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                          ₹{formatCurrency(row.current_value)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wide block">
                          Gain
                        </span>
                        <span
                          className={
                            "font-semibold tabular-nums " +
                            (isPositive
                              ? "text-[var(--color-positive)]"
                              : "text-[var(--color-negative)]")
                          }
                        >
                          {isPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(gain))}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)]/60 divide-y divide-[var(--color-border)]/40">
                      {row.schemes.map((scheme) => {
                        const schemeGain = parseFloat(scheme.unrealized_gain || "0");
                        const schemeIsPositive = schemeGain >= 0;
                        return (
                          <div
                            key={`${scheme.scheme_id}-${scheme.household_member_id}`}
                            className="p-3 pl-9 bg-[var(--color-bg)] space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-[var(--color-ink)] truncate">
                                {scheme.scheme_name}
                              </span>
                              {viewMode === "aggregate" && (
                                <span className="text-[10px] text-[var(--color-text-secondary)] flex-shrink-0">
                                  {scheme.household_member_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary)]">
                              <span>
                                {scheme.units_held} units @ ₹{scheme.average_nav ?? "—"}
                              </span>
                              <span
                                className={
                                  "font-semibold tabular-nums " +
                                  (schemeIsPositive
                                    ? "text-[var(--color-positive)]"
                                    : "text-[var(--color-negative)]")
                                }
                              >
                                {schemeIsPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(schemeGain))}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCurrency(valStr: string | number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}
