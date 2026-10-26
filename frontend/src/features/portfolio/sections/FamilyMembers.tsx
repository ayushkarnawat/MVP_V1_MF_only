import { ArrowLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_ROW } from "@/lib/clickable";
import { sumDecimalStrings } from "@/lib/decimal";
import { formatPercent, formatRupees } from "@/lib/format";
import {
  memberColor,
  memberInitials,
  memberTitleName,
  shareOf,
} from "../portfolioFormat";
import type { MemberValue } from "../types";

export interface FamilyMembersProps {
  status: "loading" | "error" | "data";
  rows: MemberValue[] | null;
  selectedId: string | null;
  onSelectMember: (id: string) => void;
  onShowFamily?: () => void;
  onRetry: () => void;
}

export function FamilyMembers({
  status,
  rows,
  selectedId,
  onSelectMember,
  onShowFamily,
  onRetry,
}: FamilyMembersProps) {
  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading family members"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 space-y-4"
      >
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-[9px] w-full rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  if (status === "error" || !rows) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6">
        <h4 className="text-base font-semibold text-[var(--ui-text-default)]">
          Couldn't load family members
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-surface)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text-default)] hover:bg-[var(--ui-elevated)] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="family-title"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h3
          id="family-title"
          className="text-base font-semibold text-[var(--ui-text-default)]"
        >
          Family Members
        </h3>
        {selectedId !== null && onShowFamily !== undefined && (
          <button
            type="button"
            onClick={onShowFamily}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text-default)] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Family combined</span>
          </button>
        )}
      </div>

      {rows.length < 2 ? (
        <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
          You're the only member in this household — nothing to compare yet. Add a family member from Profile to see a breakdown here.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--ui-text-muted)] mt-1 mb-4">
            Whole portfolio per member — click a row or bar segment to switch scope.
          </p>

          {(() => {
            const total = sumDecimalStrings(rows.map((r) => r.value));
            const shares = rows.map((r) => shareOf(r.value, total));

            return (
              <>
                <div
                  data-testid="family-bar"
                  aria-hidden="true"
                  className="flex flex-row h-[9px] rounded-full overflow-hidden bg-[var(--ui-divider)] w-full mb-4"
                >
                  {rows.map((row, index) => {
                    const share = shares[index];
                    const widthPct = `${share === null ? 0 : Number(share)}%`;
                    return (
                      <i
                        key={row.id}
                        data-testid={`family-segment-${index}`}
                        data-color={memberColor(index)}
                        style={{
                          width: widthPct,
                          backgroundColor: memberColor(index),
                        }}
                        onClick={() => onSelectMember(row.id)}
                        className="cursor-pointer block h-full transition-all"
                      />
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2">
                  {rows.map((row, index) => {
                    const share = shares[index];
                    const widthPct = `${share === null ? 0 : Number(share)}%`;
                    const color = memberColor(index);
                    const titleName = memberTitleName(row.name);
                    const initials = memberInitials(titleName);
                    const isSelected = selectedId === row.id;

                    return (
                      <div
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        data-testid={`family-row-${row.id}`}
                        aria-current={isSelected ? "true" : undefined}
                        onClick={() => onSelectMember(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (e.key === " ") e.preventDefault();
                            onSelectMember(row.id);
                          }
                        }}
                        className={`${CLICK_ROW} flex items-center justify-between gap-3 p-2.5 rounded-xl transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[var(--ui-surface)]"
                            : "hover:bg-[var(--ui-surface)]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            data-testid={`family-avatar-${row.id}`}
                            data-color={color}
                            style={{ backgroundColor: color }}
                            className="inline-flex h-[29px] w-[29px] items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                          >
                            {initials}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ui-text-default)] truncate w-[130px] sm:w-[160px]">
                            {titleName}
                          </span>
                        </div>

                        <div className="flex-1 max-w-[200px] h-[5px] rounded-full bg-[var(--ui-divider)] overflow-hidden">
                          <span
                            data-testid={`family-fill-${row.id}`}
                            style={{
                              width: widthPct,
                              backgroundColor: color,
                            }}
                            className="block h-full rounded-full"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            data-testid={`family-value-${row.id}`}
                            className="text-sm font-medium tabular-nums text-[var(--ui-text-default)]"
                          >
                            {formatRupees(row.value)}
                            {share !== null && ` (${formatPercent(share, { digits: 1 })})`}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 text-[var(--ui-text-muted)]"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </>
      )}
    </section>
  );
}
