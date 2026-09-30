import { useState } from "react";
import type { HouseholdMember } from "../auth/types";
import { PRIMARY_BTN, SECONDARY_BTN } from "../import/prompts/copy";
import { PromptDialog } from "../import/prompts/PromptDialog";

export interface DeletePortfolioDialogProps {
  member: Pick<HouseholdMember, "name" | "relationship">;
  statementsCount: number;
  pending?: boolean;
  error?: string | null;
  onDelete: (removeMember: boolean) => void;
  /** Also the way out of ×. */
  onKeep: () => void;
}

// D2: Delete a member's whole portfolio (M17). F37: they/their instead of he/his.
export function DeletePortfolioDialog({ member, statementsCount, pending = false, error, onDelete, onKeep }: DeletePortfolioDialogProps) {
  const [removeMember, setRemoveMember] = useState(false);
  // Me is never removed from the family (M17: "self member and PAN always kept").
  const canRemove = member.relationship !== "self";
  return (
    <PromptDialog
      isOpen
      title={`Delete all of ${member.name}’s funds?`}
      body={`This removes their funds from all ${statementsCount} statement${statementsCount === 1 ? "" : "s"}. Other people’s funds stay.`}
      onClose={onKeep}
      footer={
        <>
          <button type="button" onClick={onKeep} disabled={pending} className={SECONDARY_BTN}>
            Keep
          </button>
          <button type="button" onClick={() => onDelete(canRemove && removeMember)} disabled={pending} className={PRIMARY_BTN}>
            Delete
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        {canRemove && (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={removeMember} onChange={(e) => setRemoveMember(e.target.checked)} />
              <span>{`Also remove ${member.name} from my family`}</span>
            </label>
            <p className="text-[var(--color-text-secondary)]">
              {`If you remove them and later upload a statement with ${member.name} again, you’ll need to add their details again.`}
            </p>
          </>
        )}
        {error && <p role="alert" className="text-[var(--color-negative)]">{error}</p>}
      </div>
    </PromptDialog>
  );
}
