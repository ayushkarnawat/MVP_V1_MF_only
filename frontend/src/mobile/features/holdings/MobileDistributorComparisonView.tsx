import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { toTitleCase } from "@/lib/utils";
import { getDistributorComparison } from "@/features/dashboard/api";
import type { DistributorComparisonRow } from "@/features/dashboard/types";

export interface MobileDistributorComparisonViewProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  schemeId: string;
  schemeName?: string;
}

/** Mobile full-screen equivalent of DistributorComparisonModal — same
 * data source and API call (getDistributorComparison), same fields, just a
 * mobile-appropriate card list instead of a desktop table/dialog. */
export function MobileDistributorComparisonView({
  isOpen,
  onClose,
  memberId,
  schemeId,
  schemeName = "Mutual Fund Scheme",
}: MobileDistributorComparisonViewProps) {
  const [rows, setRows] = useState<DistributorComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && memberId && schemeId) {
      setLoading(true);
      setError(null);
      getDistributorComparison(memberId, schemeId)
        .then((data) => {
          setRows(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || "Failed to load distributor comparison");
          setLoading(false);
        });
    }
  }, [isOpen, memberId, schemeId]);

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
            aria-label="Back to fund details"
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
          <h2 className="font-display font-bold text-base text-[var(--color-ink)] leading-snug">
            {schemeName}
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Compare returns across Direct plans and Regular distributors for this scheme
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
              const isDirect = !row.arn_code;
              const gain = parseFloat(row.unrealized_gain || "0");
              const isPositive = gain >= 0;

              return (
                <div
                  key={row.arn_code || `direct-${idx}`}
                  className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
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
