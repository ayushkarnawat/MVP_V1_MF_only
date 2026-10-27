import { Modal } from "@/components/Modal";
import type { HouseholdMember } from "@/features/auth/types";
import { cleanName, relationshipText } from "../lib/memberLabels";
import { InitialsAvatar } from "./InitialsAvatar";

export interface AddStatementDialogProps {
  members: readonly HouseholdMember[];
  onPick: (member: HouseholdMember) => void;
  onClose: () => void;
}

export function AddStatementDialog({ members, onPick, onClose }: AddStatementDialogProps) {
  return (
    <Modal isOpen onClose={onClose} title="Add statement for whom?">
      <div className="space-y-4">
        <p className="text-sm text-[var(--shell-text-body)]">
          Choose the person this statement belongs to.
        </p>
        <ul aria-label="Household members" className="space-y-2">
          {members.map((member, index) => {
            const name = cleanName(member.name);
            return (
              <li key={member.id}>
                <button
                  type="button"
                  data-testid="whom-option"
                  aria-label={name || "Family member"}
                  onClick={() => onPick(member)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-left text-sm hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
                ><InitialsAvatar name={member.name} size={32} tone={index} /><span className="min-w-0 flex-1 truncate font-semibold text-[var(--ui-text)]">{name || "Not added"}</span><span className="shrink-0 text-xs font-medium text-[var(--ui-text-muted)]">{relationshipText(member)}</span></button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
