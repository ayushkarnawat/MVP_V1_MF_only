import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, joinNames, panOrPlaceholder } from "./copy";

export interface MemberNotInFileDialogProps {
  isOpen: boolean;
  memberName: string;
  memberPanMasked: string | null;
  /** Names of the people actually found in the file. */
  people: string[];
  onImportForThese: () => void;
  /** Also the way out of ×. */
  onUploadDifferent: () => void;
}

const NEW_FAMILY_MEMBER_NOTE = "A new family member is created if they are not already in your family.";

// U5: Add data for a member whose PAN is verified, and the file has no one with that PAN.
export function MemberNotInFileDialog({
  isOpen,
  memberName,
  memberPanMasked,
  people,
  onImportForThese,
  onUploadDifferent,
}: MemberNotInFileDialogProps) {
  const names = joinNames(people);
  const importTargetText = names
    ? `These funds will be imported for ${names}.`
    : "These funds will be imported for the people in this statement.";

  return (
    <PromptDialog
      isOpen={isOpen}
      roomy
      title={`${memberName} isn’t in this statement`}
      body={`This statement doesn’t show ${memberName}’s PAN (${panOrPlaceholder(memberPanMasked)}).${names ? ` It has ${names}.` : ""}`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
          <button type="button" onClick={onImportForThese} className={PRIMARY_BTN}>
            Import for these people
          </button>
        </>
      }
    >
      <div
        data-testid="import-for-warning"
        role="note"
        className="flex items-start gap-2.5 rounded-xl border border-[#FCE0B0] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[13.5px]"
      >
        <span
          aria-hidden="true"
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--warn)] font-display text-[12px] font-bold text-white"
        >
          !
        </span>
        <div>
          <p className="font-semibold text-[var(--ui-text)]">{importTargetText}</p>
          <p className="mt-0.5 text-[12.5px] text-[#4B4B4B] dark:text-[#A3A3A3]">{NEW_FAMILY_MEMBER_NOTE}</p>
        </div>
      </div>
    </PromptDialog>
  );
}
