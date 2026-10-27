import type { KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import {
  memberColor,
  memberInitial,
  memberTitleName,
} from "../allocationCopy";
import { formatPercent, formatRupees } from "../homeFormat";
import type { MemberShareOut } from "../types";

export interface FamilyCardsProps {
  members: MemberShareOut[];
  onSelectMember: (id: string) => void;
}

export function FamilyCards({ members, onSelectMember }: FamilyCardsProps) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--ui-text-muted)]">
          By family member
        </span>
        <span className="text-xs text-[var(--ui-text-muted)]">
          Tap a member to view their portfolio
        </span>
      </div>

      <div
        data-testid="family-bar"
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-full gap-0.5"
      >
        {members.map((member, index) => {
          const color = memberColor(index);
          const widthPct = `${Number(member.percentage)}%`;
          return (
            <i
              key={member.id}
              data-testid={`family-segment-${index}`}
              data-color={color}
              style={{
                width: widthPct,
                backgroundColor: color,
              }}
              className="block h-full transition-opacity"
            />
          );
        })}
      </div>

      <div className="space-y-2">
        {members.map((member, index) => {
          const color = memberColor(index);
          const titleName = memberTitleName(member.name);
          const shareText = `${formatPercent(member.percentage, { digits: 1 })} of family`;

          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
              onSelectMember(member.id);
            } else if (e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              onSelectMember(member.id);
            }
          };

          return (
            <div
              key={member.id}
              role="button"
              tabIndex={0}
              data-testid={`family-row-${member.id}`}
              aria-label={`${titleName}, ${shareText}`}
              className={`flex items-center justify-between rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-bg)] p-2.5 gap-3 ${CLICK_ROW}`}
              onClick={() => onSelectMember(member.id)}
              onKeyDown={handleKeyDown}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  data-testid={`family-avatar-${member.id}`}
                  data-color={color}
                  style={{ backgroundColor: color }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white font-bold text-sm shrink-0"
                >
                  {memberInitial(member.name)}
                </span>
                <span className="font-semibold text-sm text-[var(--ui-text)] truncate">
                  {titleName}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="font-semibold text-sm text-[var(--ui-text)]">
                    {formatRupees(member.value)}
                  </div>
                  <div className="text-xs text-[var(--ui-text-muted)]">
                    {shareText}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-[var(--ui-text-muted)]">
                  <span>View</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
