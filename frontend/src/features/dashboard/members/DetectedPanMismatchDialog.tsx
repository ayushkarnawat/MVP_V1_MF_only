import { PromptDialog } from "../../import/prompts/PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";

export interface DetectedPanMismatchDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string;
  submitting?: boolean;
  /** "The one I entered": nothing is saved; the caller opens the upload form. */
  onKeepEntered: () => void;
  /** "The one on the statement": resubmit with use_detected_pan. */
  onUseStatement: () => void;
  /** ×: back to the details form, values kept. */
  onClose: () => void;
}

// L3 as a popup (staging-QA decision 4, 2026-09-30), modelled on U4's
// PanMismatchDialog so the two read as one pattern.
export function DetectedPanMismatchDialog({
  isOpen, memberName, enteredPanMasked, statementPanMasked, submitting, onKeepEntered, onUseStatement, onClose,
}: DetectedPanMismatchDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title="This PAN doesn’t match your statement"
      body={`You entered ${enteredPanMasked} for ${memberName}. The statement you uploaded shows ${statementPanMasked}. Which one is correct?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onKeepEntered} className={SECONDARY_BTN}>
            {`The one I entered (${enteredPanMasked})`}
            <span className="block text-xs font-normal">Upload a different statement</span>
          </button>
          <button type="button" onClick={onUseStatement} disabled={submitting} className={PRIMARY_BTN}>
            {`The one on the statement (${statementPanMasked})`}
          </button>
        </>
      }
    />
  );
}
