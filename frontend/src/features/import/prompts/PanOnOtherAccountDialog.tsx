import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, panOrPlaceholder } from "./copy";

export interface PanOnOtherAccountDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string | null;
  /** Also the way out of ×. */
  onKeepEntered: () => void;
  onUploadDifferent: () => void;
}

// U12: after U4, the statement's PAN is already claimed by another Unifolio account.
export function PanOnOtherAccountDialog({
  isOpen,
  memberName,
  enteredPanMasked,
  statementPanMasked,
  onKeepEntered,
  onUploadDifferent,
}: PanOnOtherAccountDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`We can’t switch ${memberName} to this PAN`}
      body={`${panOrPlaceholder(statementPanMasked)} is already on another Unifolio account, so we can’t move ${memberName} to it. Keep ${enteredPanMasked}, or upload a different file.`}
      onClose={onKeepEntered}
      footer={
        <>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
          <button type="button" onClick={onKeepEntered} className={PRIMARY_BTN}>
            Keep the one I entered
          </button>
        </>
      }
    />
  );
}
