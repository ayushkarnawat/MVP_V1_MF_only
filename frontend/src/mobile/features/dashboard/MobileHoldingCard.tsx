import { FundSignal } from "@/components/FundSignal";
import { Badge } from "@/components/Badge";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { HoldingRow } from "@/features/dashboard/types";

export interface MobileHoldingCardProps {
  holding: HoldingRow;
  showMemberName?: boolean;
  onSelect?: (schemeId: string) => void;
}

export function MobileHoldingCard({
  holding,
  showMemberName = false,
  onSelect,
}: MobileHoldingCardProps) {
  const unrealized = parseFloat(
    holding.unrealized_gain || holding.current_profit_total || "0"
  );
  const isGain = unrealized >= 0;
  const invested = parseFloat(holding.amount_invested) || 0;
  const returnPct = invested > 0 ? (unrealized / invested) * 100 : 0;

  return (
    <div
      className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs hover:border-[var(--color-ink)]/20 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none"
      onClick={() => onSelect?.(holding.scheme_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelect?.(holding.scheme_id);
        }
      }}
    >
      {/* Top Row: FundSignal + Title & AMC + Badges */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex-shrink-0 pt-0.5">
            <FundSignal
              returnPercentage={returnPct}
              schemeName={holding.scheme_name}
              size="sm"
            />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-[var(--color-ink)] leading-snug line-clamp-2">
              {holding.scheme_name}
            </span>
            {holding.amc_name && (
              <span className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                {holding.amc_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge
            variant={holding.plan_type === "DIRECT" ? "positive" : "neutral"}
          >
            {holding.plan_type || "UNKNOWN"}
          </Badge>
          <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)] opacity-40 ml-0.5" />
        </div>
      </div>

      {/* Bottom Metric Row: Member / Units & Current Value + Gain/Loss */}
      <div className="flex items-end justify-between gap-2 mt-3 pt-2.5 border-t border-[var(--color-border)]/50 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {showMemberName && holding.household_member_name && (
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)]">
              {holding.household_member_name}
            </span>
          )}
          <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
            {formatNumber(holding.units_held, 2)} units
          </span>
          {holding.stale_nav && (
            <Badge variant="warning">stale</Badge>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="font-display text-sm font-bold text-[var(--color-ink)] tabular-nums type-data">
            ₹{formatCurrency(holding.current_value)}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={cn(
                "text-[11px] font-semibold tabular-nums",
                isGain
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]"
              )}
            >
              {isGain ? "↑" : "↓"} ₹{formatCurrency(Math.abs(unrealized))}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold px-1 py-0.2 rounded tabular-nums",
                isGain
                  ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]"
                  : "bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]"
              )}
            >
              {isGain ? "+" : ""}
              {returnPct.toFixed(1)}%
            </span>
          </div>
        </div>
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

function formatNumber(valStr: string | number, decimals: number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
