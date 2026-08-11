import { useEffect } from "react";
import { Badge } from "@/components/Badge";
import { FundSignal } from "@/components/FundSignal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { HoldingRow } from "@/features/dashboard/types";

export interface MobileFundDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  holding: HoldingRow | null;
}

export function MobileFundDetailSheet({
  isOpen,
  onClose,
  holding,
}: MobileFundDetailSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !holding) return null;

  const invested = parseFloat(holding.amount_invested || "0");
  const currentValue = parseFloat(holding.current_value || "0");
  const profit = parseFloat(
    holding.unrealized_gain || holding.current_profit_total || "0"
  );
  const isPositive = profit >= 0;
  const returnPct = invested > 0 ? (profit / invested) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-holding-detail-title"
    >
      <div
        className="w-full max-w-md max-h-[90dvh] bg-[var(--color-surface)] text-[var(--color-ink)] rounded-t-[32px] sm:rounded-[32px] border border-[var(--color-border)] shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-bottom duration-250 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Sheet Drag Indicator & Close Row */}
        <div className="sticky top-0 z-10 bg-[var(--color-surface)]/95 backdrop-blur-md pt-3 pb-2 px-5 flex items-center justify-between border-b border-[var(--color-border)]/50">
          <div className="w-12 h-1 bg-[var(--color-border)] rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mt-2">
            Holding Details
          </span>
          <button
            onClick={onClose}
            className="h-10 w-10 -mr-2 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all cursor-pointer mt-1"
            aria-label="Close details"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          {/* Header Area: FundSignal + Title + Badges */}
          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 pt-0.5">
              <FundSignal
                returnPercentage={returnPct}
                schemeName={holding.scheme_name}
                size="md"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant={holding.plan_type === "DIRECT" ? "positive" : "neutral"}
                >
                  {holding.plan_type || "UNKNOWN"}
                </Badge>
                {holding.household_member_name && (
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)] px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)]">
                    {holding.household_member_name}
                  </span>
                )}
              </div>
              <h2
                id="mobile-holding-detail-title"
                className="font-display font-bold text-base text-[var(--color-ink)] mt-1.5 leading-snug"
              >
                {holding.scheme_name}
              </h2>
              {holding.amc_name && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {holding.amc_name}
                </p>
              )}
            </div>
          </div>

          {/* 3-Card KPI Row */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {/* Current Value */}
            <div className="p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] flex flex-col justify-between">
              <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                Current Value
              </span>
              <span className="font-display text-base font-bold text-[var(--color-ink)] tabular-nums type-data mt-1">
                ₹{formatCurrency(currentValue)}
              </span>
            </div>

            {/* Invested Amount */}
            <div className="p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] flex flex-col justify-between">
              <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                Invested Amount
              </span>
              <span className="font-display text-base font-semibold text-[var(--color-ink)] tabular-nums type-data mt-1">
                ₹{formatCurrency(invested)}
              </span>
            </div>

            {/* Total Return Span 2 */}
            <div className="col-span-2 p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                Total Gain / Loss
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-display text-base font-bold tabular-nums inline-flex items-center",
                    isPositive
                      ? "text-[var(--color-positive)]"
                      : "text-[var(--color-negative)]"
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-4 w-4 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-0.5" />
                  )}
                  ₹{formatCurrency(Math.abs(profit))}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums",
                    isPositive
                      ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]"
                      : "bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {returnPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Details Breakdown List */}
          <div className="p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] divide-y divide-[var(--color-border)]/60 text-xs space-y-2.5">
            <div className="flex items-center justify-between pt-1">
              <span className="text-[var(--color-text-secondary)]">Units Held</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                {formatNumber(holding.units_held, 3)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2.5">
              <span className="text-[var(--color-text-secondary)]">Average NAV</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                ₹{formatNumber(holding.average_nav, 2)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2.5">
              <span className="text-[var(--color-text-secondary)]">Current NAV</span>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                  ₹{formatNumber(holding.current_nav, 2)}
                </span>
                {holding.stale_nav && (
                  <Badge variant="warning">stale</Badge>
                )}
              </div>
            </div>

            {holding.current_nav_date && (
              <div className="flex items-center justify-between pt-2.5">
                <span className="text-[var(--color-text-secondary)]">NAV Date</span>
                <span className="text-[var(--color-text-secondary)]">
                  {holding.current_nav_date}
                </span>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="w-full h-11 font-semibold rounded-xl text-xs shadow-2xs active:scale-95"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNumber(valStr: string | number, decimals: number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
