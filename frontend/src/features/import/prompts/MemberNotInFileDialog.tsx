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

// U5: Add data for a member whose PAN is verified, and the file has no one with that PAN.
export function MemberNotInFileDialog({
  isOpen,
  memberName,
  memberPanMasked,
  people,
  onImportForThese,
  onUploadDifferent,
}: MemberNotInFileDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`${memberName} isn’t in this statement`}
      body={`This statement doesn’t show ${memberName}’s PAN (${panOrPlaceholder(memberPanMasked)}). It has ${joinNames(people)}.`}
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
    />
  );
}
