import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatIndianCurrency } from "../../lib/decimal";
import { cn } from "@/lib/utils";
import type { RealizedSummary } from "./types";

/** #9: funds the investor fully sold, with the gain or loss they realised.
 * Collapsed by default; hidden when nothing is fully sold. `memberId`
 * narrows it to one family member (the holdings member filter). */
export function SoldFundsSection({ summary, memberId }: { summary: RealizedSummary | null | undefined; memberId?: string }) {
  const [open, setOpen] = useState(false);
  const funds = (summary?.funds ?? []).filter(
    (f) => f.fully_sold && (!memberId || f.household_member_id === memberId),
  );
  if (funds.length === 0) return null;
  return (
    <section className="flex flex-col space-y-3" aria-label="Sold funds">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 self-start font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] cursor-pointer"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Sold funds ({funds.length})
      </button>
      {open && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
          {funds.map((f) => {
            const negative = f.realized_gain.trim().startsWith("-");
            const magnitude = f.realized_gain.trim().replace(/^[+-]/, "");
            return (
              <div key={`${f.scheme_id}-${f.household_member_id}-${f.plan_type}`} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">
                  {f.scheme_name} · {f.household_member_name}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums",
                  negative ? "text-[var(--color-negative)]" : "text-[var(--color-positive)]")}>
                  {negative ? "−" : ""}₹{formatIndianCurrency(magnitude)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
