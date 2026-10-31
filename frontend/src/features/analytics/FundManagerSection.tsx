import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimal } from "@/lib/decimal";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { movementRupees } from "./PeriodBreakdownTable";
import { cn } from "@/lib/utils";
import { HelpCircle, Users } from "lucide-react";
import type { FundManagerAllocationSummary } from "./types";

export interface FundManagerSectionProps {
  data: FundManagerAllocationSummary | null;
  isLoading?: boolean;
  className?: string;
  /** The same static table is used on screen and in print. */
  printMode?: boolean;
}

function share(value: string | undefined): string {
  if (value == null) return "—";
  return `${formatDecimal(value).replace(/\.?0+$/, "")}%`;
}

export function FundManagerSection({ data, isLoading = false, className }: FundManagerSectionProps) {

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-4", className)}>
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  const managerGroups = data?.manager_groups ?? [];
  const unavailable = data?.unavailable_schemes ?? [];
  const hasAnything = managerGroups.length > 0 || unavailable.length > 0;

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Fund Manager Allocation
            </h2>
            <Users aria-hidden="true" className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Who is actually running your money, aggregated across your whole portfolio
          </p>
        </div>
      </div>

      {!hasAnything ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No fund manager data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0 max-w-full">
            <Table aria-label="Fund manager allocation" className="min-w-[480px]">
              <TableCaption>Each fund's full value is counted under its main manager.</TableCaption>
              <TableHeader><TableRow>
                <TableHead scope="col">Fund manager</TableHead>
                <TableHead scope="col">AMC</TableHead>
                <TableHead scope="col" className="text-right">Current value</TableHead>
                <TableHead scope="col" className="text-right">% of overall portfolio</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {managerGroups.map(group => <TableRow key={JSON.stringify([group.manager_name, group.amc_name])}>
                  <TableHead scope="row" className="text-[var(--color-ink)]">{group.manager_name}</TableHead>
                  <TableCell>{group.amc_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{movementRupees(group.total_household_value)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{share(group.percentage)}</TableCell>
                </TableRow>)}
              </TableBody>
              <TableFooter><TableRow>
                <TableHead scope="row" colSpan={2}>Covered by manager data</TableHead>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{data?.covered_value == null ? "—" : movementRupees(data.covered_value)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{share(data?.covered_percentage)}</TableCell>
              </TableRow></TableFooter>
            </Table>
          </div>

          {unavailable.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-start gap-2">
              <HelpCircle aria-hidden="true" className="h-4 w-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="min-w-0 break-words">
                <p className="text-xs text-[var(--color-text-secondary)] font-semibold">
                  Fund manager data for these schemes isn't available yet.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {unavailable.map((scheme) => (
                    <li key={scheme.scheme_id} className="text-xs text-[var(--color-text-secondary)]/80">
                      {scheme.scheme_name} ({scheme.amc_name})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
