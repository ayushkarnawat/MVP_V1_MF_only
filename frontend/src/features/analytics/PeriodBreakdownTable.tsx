import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import { formatExactDate } from "@/lib/dateRange";
import { cn } from "@/lib/utils";
import { breakdownTotals, groupByFund, transactionLabel } from "@/components/mf/periodBreakdown";
import type { InvestmentWithdrawalBucket } from "./types";

/** Round once to whole rupees, keeping even large backend amounts exact. */
export function movementRupees(value: string): string {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return "₹0";
  const rounded = sumDecimalStrings([match[2], (match[3] ?? "0")[0] >= "5" ? "1" : "0"]);
  const sign = match[1] === "-" && compareDecimalStrings(rounded, "0") !== 0 ? "-" : "";
  return `${sign}₹${new Intl.NumberFormat("en-IN").format(BigInt(rounded))}`;
}

const FILTER = "min-h-11 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const MONEY = "whitespace-nowrap text-right tabular-nums";

export function PeriodBreakdown({ bucket, periodTitle }: { bucket: InvestmentWithdrawalBucket; periodTitle: string }) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const members = new Map(bucket.entries.map(entry => [entry.household_member_id, entry.household_member_name]));
  const activeMember = memberId !== null && members.has(memberId) ? memberId : null;
  const { rows, opening } = groupByFund(bucket.entries, activeMember);
  const totals = breakdownTotals(rows);
  const summary = [["Invested", totals.invested], ["Withdrawn", totals.withdrawn], ["Switched in", totals.switchedIn], ["Switched out", totals.switchedOut]];
  if (compareDecimalStrings(opening, "0") !== 0) summary.push(["Opening holdings", opening]);

  return (
    <section aria-label={`${periodTitle} breakdown`} className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--color-ink)]">{periodTitle}</h3>
      {members.size > 1 && (
        <div role="group" aria-label="Household member" className="flex flex-wrap gap-2">
          {[[null, "All"], ...members] .map(([id, name]) => (
            <button key={id ?? "all"} type="button" aria-pressed={activeMember === id}
              className={cn(FILTER, activeMember === id && "bg-[var(--color-bg)] text-[var(--color-ink)]")}
              onClick={() => { setMemberId(id); setExpanded(new Set()); }}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label="Period totals" className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
        {summary.map(([label, amount]) => <span key={label} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1">{label} {movementRupees(amount)}</span>)}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{bucket.entries.length === 0 ? "No transactions in this period" : "Only opening holdings in this period"}</p>
      ) : (
        <Table aria-label={`${periodTitle} fund breakdown`}>
          <TableHeader><TableRow>
            {["Fund", "Invested", "Withdrawn", "Switched in", "Switched out", "Net"].map((label, index) => <TableHead key={label} scope="col" className={index ? MONEY : undefined}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(row => (
              <Fragment key={row.schemeName}>
                <TableRow>
                  <TableCell>
                    <button type="button" aria-label={`${row.schemeName} transactions`} aria-expanded={expanded.has(row.schemeName)}
                      className="flex min-h-11 items-center gap-2 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                      onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(row.schemeName)) next.delete(row.schemeName); else next.add(row.schemeName); return next; })}>
                      <ChevronRight aria-hidden="true" size={16} className={cn("shrink-0", expanded.has(row.schemeName) && "rotate-90")} />
                      {row.schemeName}
                    </button>
                    <p className="text-xs text-[var(--color-text-secondary)]">{row.memberNames.join(", ")}</p>
                  </TableCell>
                  {[row.invested, row.withdrawn, row.switchedIn, row.switchedOut, row.net].map((amount, index) => <TableCell key={index} className={MONEY}>{movementRupees(amount)}</TableCell>)}
                </TableRow>
                {expanded.has(row.schemeName) && (
                  <TableRow><TableCell colSpan={6}>
                    <ul aria-label={`${row.schemeName} transactions`} className="space-y-2">
                      {row.entries.map(entry => <li key={entry.transaction_id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--color-text-secondary)]"><time dateTime={entry.date}>{formatExactDate(entry.date) ?? entry.date}</time> · {entry.household_member_name} · <span>{transactionLabel(entry)}</span></span>
                        <span className={cn("tabular-nums", entry.direction === "withdrawn" ? "text-[var(--color-negative)]" : "text-[var(--color-ink)]")}>{movementRupees(entry.amount)}</span>
                      </li>)}
                    </ul>
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
          <TableFooter><TableRow><TableCell>Total</TableCell>
            {[totals.invested, totals.withdrawn, totals.switchedIn, totals.switchedOut, totals.net].map((amount, index) => <TableCell key={index} className={MONEY}>{movementRupees(amount)}</TableCell>)}
          </TableRow></TableFooter>
        </Table>
      )}
    </section>
  );
}
