import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface ConfirmLeaveDialogProps {
  isOpen: boolean;
  memberName: string;
  onKeepEditing: () => void;
  /** Discards what was typed and closes the whole sequence. */
  onSkip: () => void;
}

// Spec mock 4: Exit in the Complete profile popup always asks first (Q5).
export function ConfirmLeaveDialog({ isOpen, memberName, onKeepEditing, onSkip }: ConfirmLeaveDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`Skip completing ${memberName}’s profile?`}
      body={`Anything you typed won’t be saved. You can finish it any time from the chip next to ${memberName}’s name.`}
      onClose={onKeepEditing}
      footer={
        <>
          <button type="button" onClick={onSkip} className={SECONDARY_BTN}>
            Skip for now
          </button>
          <button type="button" onClick={onKeepEditing} className={PRIMARY_BTN}>
            Keep editing
          </button>
        </>
      }
    />
  );
}
