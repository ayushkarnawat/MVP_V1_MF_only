import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { HouseholdMember } from "@/features/auth/types";
import { deleteMemberPortfolio } from "@/features/import/api";
import { cleanName } from "../lib/memberLabels";

export interface DeleteMemberDialogProps {
  member: HouseholdMember;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteMemberDialog({ member, onClose, onDeleted }: DeleteMemberDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  // The account holder is never removed; no dialog and no request, whatever the caller does.
  if (member.relationship === "self") return null;

  const close = () => {
    tokenRef.current += 1;
    onClose();
  };

  const remove = async () => {
    if (pending) return;
    const token = tokenRef.current;
    setPending(true);
    setError(null);
    try {
      // true is the remove_member argument: the same call "Delete all funds" makes with its box ticked.
      await deleteMemberPortfolio(member.id, true);
      if (tokenRef.current !== token) return;
      onDeleted();
    } catch {
      if (tokenRef.current !== token) return;
      setError("Could not delete this member. Please try again.");
    } finally {
      if (tokenRef.current === token) setPending(false);
    }
  };

  return (
    <Modal isOpen onClose={close} title={`Delete ${cleanName(member.name) || "this member"} from your family?`}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--shell-text-body)]">
          This removes all of their funds from your statements and removes them from your family. Other people’s funds stay.
        </p>
        <p className="text-xs text-[var(--ui-text-muted)]">
          If you upload a statement with them again, you will need to add their details again.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[var(--neg-text)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-lg bg-[var(--neg-text)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            {pending ? "Deleting…" : "Delete member"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
