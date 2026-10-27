import { FileUp, Users } from "lucide-react";
import type { HouseholdMember } from "@/features/auth/types";
import { accessLevel } from "../lib/accessLevel";
import { cleanName, firstName } from "../lib/memberLabels";
import { InitialsAvatar } from "./InitialsAvatar";

export interface FamilyStripProps {
  members: readonly HouseholdMember[];
  onManage: () => void;
  onAddStatement: () => void;
  onSelect: (memberId: string) => void;
}

export function FamilyStrip({ members, onManage, onAddStatement, onSelect }: FamilyStripProps) {
  return (
    <section data-testid="family-strip" className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
            Family Account
          </h2>
          <p className="mt-1 text-sm text-[var(--shell-text-body)]">
            Manage family members and their access
          </p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <Users size={15} aria-hidden="true" />
          <span>Manage Members</span>
        </button>
      </div>

      <ul aria-label="Family members" className="mt-4 flex flex-wrap gap-4">
        {members.map((member, index) => {
          const label = accessLevel(member.relationship);
          return (
            <li key={member.id}>
              <button
                type="button"
                data-testid="strip-member"
                aria-label={`Show ${cleanName(member.name) || "this member"} in the list`}
                onClick={() => onSelect(member.id)}
                className="flex w-24 flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
              >
                <InitialsAvatar name={member.name} size={52} tone={index} />
                <span data-testid="strip-name" className="w-full truncate text-sm font-semibold text-[var(--ui-text)]">
                  {firstName(member.name)}
                </span>
                <span
                  data-testid="strip-label"
                  className={`text-xs font-semibold ${
                    label === "Admin" ? "text-[var(--pos-text)]" : "text-[var(--ui-text-muted)]"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}

        <li>
          <button
            type="button"
            data-testid="add-statement-tile"
            aria-label="Add statement"
            onClick={onAddStatement}
            className="flex w-24 flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <span className="inline-grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-dashed border-[var(--ui-disabled-border)] text-[var(--ui-text-muted)]">
              <FileUp size={20} aria-hidden="true" />
            </span>
            <span className="w-full truncate text-sm font-semibold text-[var(--ui-text)]">
              Add statement
            </span>
            <span className="text-xs text-[var(--ui-text-muted)]">
              For a family member
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}
