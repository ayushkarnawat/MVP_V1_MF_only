import type { KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import { Skeleton } from "@/components/ui/skeleton";
import {
  compareDecimalStrings,
  formatLegendPercent,
  liveRows,
  soonRows,
} from "../allocationCopy";
import { AllocationDonut } from "../components/AllocationDonut";
import { FamilyCards } from "../components/FamilyCards";
import { PartialDataBadge } from "../components/PartialDataBadge";
import { formatCompactRupees } from "../homeFormat";
import type { AllocationResponse } from "../types";

export interface AllocationProps {
  status: "loading" | "error" | "data";
  data: AllocationResponse | null;
  scope: "aggregate" | "member";
  memberName?: string | null;
  onClassClick?: (key: string) => void;
  onSelectMember: (id: string) => void;
  onShowFamily?: () => void;
  onRetry: () => void;
}

export function Allocation({
  status,
  data,
  scope,
  memberName,
  onClassClick,
  onSelectMember,
  onShowFamily,
  onRetry,
}: AllocationProps) {
  if (status === "loading") {
    return (
      <div className="rounded-xl bg-[var(--ui-elevated)] border border-[var(--ui-divider)] p-4">
        <div role="status" aria-label="Loading allocation" className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="h-40 w-40 rounded-full shrink-0" />
            <div className="w-full flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-xl bg-[var(--ui-elevated)] border border-[var(--ui-divider)] p-4">
        <h3 className="text-base font-bold text-[var(--ui-text)]">
          Asset allocation
        </h3>
        <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
          Could not load allocation.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  const isEmpty = compareDecimalStrings(data.total_value, "0") <= 0;

  if (isEmpty) {
    const soon = soonRows(data.classes);
    return (
      <div className="rounded-xl bg-[var(--ui-elevated)] border border-[var(--ui-divider)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--ui-text)]">
            Asset allocation
          </h3>
          <div
            aria-disabled="true"
            title="Coming soon"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ui-text-muted)] cursor-not-allowed"
          >
            <span>View in Analytics</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
          Add investments to see allocation
        </p>
        <div className="mt-4 space-y-1">
          {soon.map((row) => (
            <div
              key={row.key}
              data-testid={`legend-soon-${row.key}`}
              aria-disabled="true"
              className="flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text-muted)] opacity-70"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0 bg-[var(--ui-divider)]" />
                <span className="truncate">{row.label}</span>
              </div>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-[var(--ui-divider)] bg-[var(--ui-bg)] text-[var(--ui-text-muted)]">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const live = liveRows(data.classes);
  const soon = soonRows(data.classes);
  const donutRows = live.filter(
    (row) => compareDecimalStrings(row.value, "0") !== 0
  );

  return (
    <div className="rounded-xl bg-[var(--ui-elevated)] border border-[var(--ui-divider)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-[var(--ui-text)]">
            Asset allocation
          </h3>
          {data.partial && <PartialDataBadge missingFunds={data.missing_funds} />}
          {data.approximate && (
            <span
              title="Estimated from your funds' categories"
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--warn-bg)] text-[var(--warn-text)]"
            >
              Approximate
            </span>
          )}
        </div>
        <div
          aria-disabled="true"
          title="Coming soon"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ui-text-muted)] cursor-not-allowed"
        >
          <span>View in Analytics</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0">
          <AllocationDonut
            rows={donutRows}
            centerValue={formatCompactRupees(data.total_value)}
            onSliceClick={onClassClick}
          />
        </div>
        <div className="w-full flex-1 space-y-1">
          {live.map((row) => {
            const isClickable = Boolean(onClassClick);
            const handleKeyDown = (e: KeyboardEvent) => {
              if (!onClassClick) return;
              if (e.key === "Enter") {
                onClassClick(row.key);
              } else if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                onClassClick(row.key);
              }
            };

            return (
              <div
                key={row.key}
                data-testid={`legend-${row.key}`}
                data-color={row.color}
                {...(isClickable
                  ? {
                      role: "button",
                      tabIndex: 0,
                      className: `flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text)] ${CLICK_ROW}`,
                      onClick: () => onClassClick!(row.key),
                      onKeyDown: handleKeyDown,
                    }
                  : {
                      className:
                        "flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text)]",
                    })}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{ backgroundColor: row.color }}
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                  />
                  <span className="truncate">{row.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-sm">
                    {formatLegendPercent(row.percentage)}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-[var(--ui-text-muted)]"
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
          {soon.map((row) => (
            <div
              key={row.key}
              data-testid={`legend-soon-${row.key}`}
              aria-disabled="true"
              className="flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text-muted)] opacity-70"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0 bg-[var(--ui-divider)]" />
                <span className="truncate">{row.label}</span>
              </div>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-[var(--ui-divider)] bg-[var(--ui-bg)] text-[var(--ui-text-muted)]">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.members != null ? (
        <FamilyCards members={data.members} onSelectMember={onSelectMember} />
      ) : scope === "member" ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-bg)] p-3 text-sm text-[var(--ui-text)]">
          <span>
            {memberName && memberName.trim()
              ? `Viewing ${memberName.trim()}'s portfolio`
              : "Viewing this portfolio"}
          </span>
          {onShowFamily ? (
            <button
              type="button"
              onClick={onShowFamily}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ui-text)] hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Family combined</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
