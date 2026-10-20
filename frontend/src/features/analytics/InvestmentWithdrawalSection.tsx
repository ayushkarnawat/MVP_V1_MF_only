// frontend/src/features/analytics/InvestmentWithdrawalSection.tsx
import { useState } from "react";
import { BarChart } from "@/components/ui/charts/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { compareDecimalStrings } from "@/lib/decimal";
import { tilesFor, toBarData } from "./investmentWithdrawalMath";
import { movementRupees as rupees, PeriodBreakdown } from "./PeriodBreakdownTable";
import type { InvestmentWithdrawalResult } from "./types";

export interface InvestmentWithdrawalSectionProps {
  data: InvestmentWithdrawalResult | null;
  isLoading?: boolean;
  className?: string;
  /** A PDF cannot click the Monthly/Yearly toggle: print the default monthly view. */
  printMode?: boolean;
}

type Granularity = "monthly" | "yearly";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-01" -> "Jan ’26" (axis); "2026" stays "2026". */
function shortPeriod(period: string): string {
  const [year, month] = period.split("-");
  return month ? `${MONTHS[Number(month) - 1]} ’${year.slice(2)}` : year;
}

/** "2026-01" -> "January 2026" (drill-in heading). */
function longPeriod(period: string): string {
  const [year, month] = period.split("-");
  return month ? `${MONTHS_LONG[Number(month) - 1]} ${year}` : year;
}

function signClass(value: string): string {
  if (value.startsWith("-")) return "text-[var(--color-negative)]";
  return /[1-9]/.test(value) ? "text-[var(--color-positive)]" : "text-[var(--color-ink)]";
}

function Tile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 min-w-0">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", valueClass ?? "text-[var(--color-ink)]")}>{rupees(value)}</p>
    </div>
  );
}

export function InvestmentWithdrawalSection({ data, isLoading = false, className, printMode = false }: InvestmentWithdrawalSectionProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [includeSwitches, setIncludeSwitches] = useState(false);

  if (isLoading) {
    return (
      <div data-testid="investment-withdrawal-skeleton" className={cn(CARD, "space-y-4", className)}>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  // Not loading and still no data = the section failed to compute (the view's
  // failed-section banner offers Retry). Say so instead of a skeleton forever.
  if (!data) {
    return (
      <section className={cn(CARD, className)}>
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Investment &amp; Withdrawal</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Investment &amp; withdrawal data isn’t available right now.</p>
      </section>
    );
  }

  const buckets = granularity === "monthly" ? data.monthly : data.yearly;
  const selected = buckets.find((b) => b.period === selectedPeriod) ?? null;
  const sip = data.sip_summary;
  const switchesIncluded = !printMode && includeSwitches;
  const tiles = tilesFor(data, switchesIncluded);
  const switchCount = data.switch_count ?? 0;

  return (
    <section className={cn(CARD, "space-y-6", className)}>
      <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Investment &amp; Withdrawal</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Invested" value={tiles.invested} />
        <Tile label="Withdrawn" value={tiles.withdrawn} valueClass="text-[var(--color-negative)]" />
        <Tile label="Net Invested" value={tiles.net} />
        <Tile label="Current Value" value={data.current_value} valueClass="text-[var(--color-accent)]" />
        <Tile label="Absolute Gain" value={data.absolute_gain} valueClass={signClass(data.absolute_gain)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-secondary)]">{switchCount > 0
          ? `Switched between funds: ${rupees(data.total_switched_out ?? "0")} in ${switchCount} ${switchCount === 1 ? "switch" : "switches"}`
          : "Switched between funds: none"}</p>
        {!printMode && <button type="button" aria-pressed={includeSwitches} onClick={() => setIncludeSwitches(current => !current)}
          className={cn("min-h-11 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]", includeSwitches && "bg-[var(--color-bg)]")}>
          Include switches
        </button>}
      </div>
      {switchesIncluded && <p className="text-xs text-[var(--color-text-secondary)]">Net invested and Absolute Gain exclude switches.</p>}
      {/[1-9]/.test(data.gifts_net) && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          {data.gifts_net.startsWith("-")
            ? `Gain includes ₹${formatIndianCurrency(data.gifts_net.slice(1))} of units given away as gifts.`
            : `Gain excludes ₹${formatIndianCurrency(data.gifts_net)} of units received as gifts.`}
        </p>
      )}

      {compareDecimalStrings(data.opening_holdings ?? "0", "0") !== 0 && <p className="text-sm text-[var(--color-text-secondary)]">Opening holdings {rupees(data.opening_holdings ?? "0")} (in Invested, not drawn as a bar)</p>}

      {data.monthly.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No transactions yet</p>
      ) : (
        <div className="space-y-3">
          {!printMode && (<div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="group" aria-label="Period">
            {(["monthly", "yearly"] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={granularity === g}
                onClick={() => { setGranularity(g); setSelectedPeriod(null); }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold",
                  granularity === g ? "bg-[var(--color-accent)] text-[var(--color-surface)]" : "text-[var(--color-text-secondary)]",
                )}
              >
                {g === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>)}
          <BarChart
            data={toBarData(buckets, switchesIncluded)}
            selectedPeriod={printMode ? null : selectedPeriod}
            formatLabel={shortPeriod}
            onBarClick={printMode ? undefined : setSelectedPeriod}
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-positive)]">■</span> Invested · <span className="text-[var(--color-negative)]">■</span> Withdrawn{switchesIncluded && <> · <span className="opacity-45">■</span> <span>Switched</span></>}{printMode ? "" : " · Tap a period to see its transactions"}
          </p>
          {!printMode && selected && (
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
              <PeriodBreakdown key={selected.period} bucket={selected} periodTitle={longPeriod(selected.period)} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 flex flex-wrap items-center gap-3 text-sm">
        {sip.active_count === 0 ? (
          <span className="text-[var(--color-text-secondary)]">No active SIPs</span>
        ) : (
          <>
            <span className="text-[var(--color-ink)]">{sip.active_count} active {sip.active_count === 1 ? "SIP" : "SIPs"}</span>
            <span className="tabular-nums text-[var(--color-ink)]">{rupees(sip.total_monthly_amount)}/month</span>
            {sip.missed_count > 0 && (
              <span className="rounded-md bg-[var(--color-warning)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
                {sip.missed_count} missed {sip.missed_count === 1 ? "instalment" : "instalments"}
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
