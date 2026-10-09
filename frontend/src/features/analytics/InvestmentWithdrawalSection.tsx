// frontend/src/features/analytics/InvestmentWithdrawalSection.tsx
import { useState } from "react";
import { BarChart } from "@/components/ui/charts/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { InvestmentWithdrawalBucket, InvestmentWithdrawalEntry, InvestmentWithdrawalResult } from "./types";

export interface InvestmentWithdrawalSectionProps {
  data: InvestmentWithdrawalResult | null;
  isLoading?: boolean;
  className?: string;
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

/** "-120000.00" -> "−₹1,20,000". The sign is read from the string, not a float. */
function rupees(value: string): string {
  return value.startsWith("-") ? `−₹${formatIndianCurrency(value.slice(1))}` : `₹${formatIndianCurrency(value)}`;
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

function entryLabel(entry: InvestmentWithdrawalEntry): string {
  if (entry.direction === "reversal") return "Bounced SIP (reversed)";
  return entry.direction === "invested" ? "Invested" : "Withdrawn";
}

function PeriodTransactions({ bucket }: { bucket: InvestmentWithdrawalBucket }) {
  if (bucket.entries.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No transactions in this period</p>;
  }
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {bucket.entries.map((entry) => (
        <li key={entry.transaction_id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="text-[var(--color-ink)] truncate">{entry.scheme_name}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {entry.date} · {entry.household_member_name} · {entryLabel(entry)}
            </p>
          </div>
          <span className={cn("tabular-nums font-medium", entry.direction === "invested" ? "text-[var(--color-ink)]" : "text-[var(--color-negative)]")}>
            {rupees(entry.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InvestmentWithdrawalSection({ data, isLoading = false, className }: InvestmentWithdrawalSectionProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

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

  return (
    <section className={cn(CARD, "space-y-6", className)}>
      <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Investment &amp; Withdrawal</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Invested" value={data.total_invested} />
        <Tile label="Withdrawn" value={data.total_withdrawn} valueClass="text-[var(--color-negative)]" />
        <Tile label="Net Invested" value={data.net_invested} />
        <Tile label="Current Value" value={data.current_value} valueClass="text-[var(--color-accent)]" />
        <Tile label="Absolute Gain" value={data.absolute_gain} valueClass={signClass(data.absolute_gain)} />
      </div>
      {/[1-9]/.test(data.gifts_net) && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          {data.gifts_net.startsWith("-")
            ? `Gain includes ₹${formatIndianCurrency(data.gifts_net.slice(1))} of units given away as gifts.`
            : `Gain excludes ₹${formatIndianCurrency(data.gifts_net)} of units received as gifts.`}
        </p>
      )}

      {data.monthly.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No transactions yet</p>
      ) : (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="group" aria-label="Period">
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
          </div>
          <BarChart
            data={buckets.map((b) => ({ period: b.period, invested: Number(b.invested), withdrawn: Number(b.withdrawn) }))}
            selectedPeriod={selectedPeriod}
            formatLabel={shortPeriod}
            onBarClick={setSelectedPeriod}
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-positive)]">■</span> Invested · <span className="text-[var(--color-negative)]">■</span> Withdrawn · Tap a period to see its transactions
          </p>
          {selected && (
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{longPeriod(selected.period)}</p>
              <PeriodTransactions bucket={selected} />
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
