import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, HelpCircle, Users } from "lucide-react";
import type { FundManagerAllocationSummary } from "./types";

export interface FundManagerSectionProps {
  data: FundManagerAllocationSummary | null;
  isLoading?: boolean;
  className?: string;
  /** Every card open and no toggles: a static PDF can't click to reveal a manager's funds. */
  printMode?: boolean;
}

export function FundManagerSection({ data, isLoading = false, className, printMode = false }: FundManagerSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sectionId = useId();

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
          {managerGroups.map((group, index) => {
            const isOpen = printMode || !!expanded[group.manager_name];
            const fundsId = `${sectionId}-funds-${index}`;
            return (
              <div key={group.manager_name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40">
                {(() => {
                  // A <button> may only hold phrasing content, so the header uses spans.
                  const header = (
                    <>
                      <span className="min-w-0 flex items-center gap-2 flex-wrap break-words">
                        <span className="font-display text-sm font-bold text-[var(--color-ink)]">{group.manager_name}</span>
                        {group.role && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 whitespace-normal">{group.role}</Badge>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums">
                          ₹{formatIndianCurrency(group.total_household_value)}
                        </span>
                        {!printMode && (isOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />)}
                      </span>
                    </>
                  );
                  return printMode ? (
                    <div className="w-full flex items-center justify-between gap-3 p-4">{header}</div>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={fundsId}
                      onClick={() => setExpanded((prev) => ({ ...prev, [group.manager_name]: !prev[group.manager_name] }))}
                      className="w-full min-h-11 flex items-center justify-between gap-3 p-4 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    >
                      {header}
                    </button>
                  );
                })()}
                {isOpen && (
                  <div id={fundsId} className="px-4 pb-4 space-y-2 border-t border-[var(--color-border)]/60 pt-3">
                    {group.funds.map((fund) => (
                      <div key={fund.scheme_id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0 flex items-center gap-2 flex-wrap break-words">
                          <span className="text-[var(--color-text-secondary)]">{fund.scheme_name}</span>
                          {group.role === null && fund.role && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0 whitespace-normal">{fund.role}</Badge>
                          )}
                        </div>
                        <span className="shrink-0 font-semibold text-[var(--color-ink)] tabular-nums">
                          ₹{formatIndianCurrency(fund.household_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
