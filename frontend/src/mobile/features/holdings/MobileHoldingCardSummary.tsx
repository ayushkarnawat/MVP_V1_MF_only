import { FundSignal } from "@/components/FundSignal";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { HoldingRow } from "@/features/dashboard/types";

export interface MobileHoldingCardSummaryProps {
  holding: HoldingRow;
  onSelect?: (holding: HoldingRow) => void;
}

export function MobileHoldingCardSummary({
  holding,
  onSelect,
}: MobileHoldingCardSummaryProps) {
  const unrealized = parseFloat(
    holding.unrealized_gain || holding.current_profit_total || "0"
  );
  const invested = parseFloat(holding.amount_invested) || 0;
  const returnPct = invested > 0 ? (unrealized / invested) * 100 : 0;

  return (
    <div
      className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs hover:border-[var(--color-ink)]/20 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none"
      onClick={() => onSelect?.(holding)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelect?.(holding);
        }
      }}
      aria-label={`${holding.scheme_name} holding`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: FundSignal + Scheme Name + Member Name */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0">
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
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {holding.household_member_name && (
                <span className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate">
                  {holding.household_member_name}
                </span>
              )}
              {holding.stale_nav && <Badge variant="warning">stale</Badge>}
            </div>
          </div>
        </div>

        {/* Right: Current Value + Arrow Indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)]">
              Current Value
            </span>
            <span className="font-display text-sm font-bold text-[var(--color-ink)] tabular-nums type-data mt-0.5">
              ₹{formatCurrency(holding.current_value)}
            </span>
          </div>

          <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)] opacity-40 ml-0.5 flex-shrink-0" />
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
