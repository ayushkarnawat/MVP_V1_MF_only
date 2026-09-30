import { useState } from "react";
import { PRIMARY_BTN, SECONDARY_BTN, joinNames } from "../import/prompts/copy";
import { PromptDialog } from "../import/prompts/PromptDialog";
import type { HouseholdImportHistoryItem } from "../import/types";

export type DeleteScope = "person" | "group";

export interface DeleteImportDialogProps {
  /** The person's row the user clicked Delete on. */
  item: HouseholdImportHistoryItem;
  /** Locked people who would be left with no data, per scope; drives the removal note. */
  willRemove?: Record<DeleteScope, string[]>;
  pending?: boolean;
  error?: string | null;
  onDelete: (scope: DeleteScope) => void;
  /** Also the way out of ×. */
  onKeep: () => void;
}

// D1: Delete on a statement in Import History that covered several people (M17).
export function DeleteImportDialog({ item, willRemove, pending = false, error, onDelete, onKeep }: DeleteImportDialogProps) {
  const [scope, setScope] = useState<DeleteScope>("person");
  const removed = willRemove?.[scope] ?? [];
  return (
    <PromptDialog
      isOpen
      title="Delete this statement’s funds?"
      onClose={onKeep}
      footer={
        <>
          <button type="button" onClick={onKeep} disabled={pending} className={SECONDARY_BTN}>
            Keep
          </button>
          <button type="button" onClick={() => onDelete(scope)} disabled={pending} className={PRIMARY_BTN}>
            Delete
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="delete-scope" checked={scope === "person"} onChange={() => setScope("person")} />
          <span>{`Only ${item.member_name}’s funds from this statement`}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="delete-scope" checked={scope === "group"} onChange={() => setScope("group")} />
          <span>{`Everyone in this statement (${item.group_people_count} people)`}</span>
        </label>
        {removed.length > 0 && (
          <p className="text-[var(--color-text-secondary)]">
            {`${joinNames(removed)} ${removed.length === 1 ? "has" : "have"} no other data and will be removed from your family.`}
          </p>
        )}
        {error && <p role="alert" className="text-[var(--color-negative)]">{error}</p>}
      </div>
    </PromptDialog>
  );
}
