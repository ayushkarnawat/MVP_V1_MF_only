import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface CancelImportDialogProps {
  isOpen: boolean;
  peopleCount: number;
  /** Also the way out of ×. */
  onKeepReviewing: () => void;
  onCancelImport: () => void;
}

// C3: Cancel on the ribbon screen, or closing the people popup.
export function CancelImportDialog({ isOpen, peopleCount, onKeepReviewing, onCancelImport }: CancelImportDialogProps) {
  const people = peopleCount === 1 ? "1 person" : `${peopleCount} people`;
  return (
    <PromptDialog
      isOpen={isOpen}
      title="Cancel this import?"
      body={`Your review choices for ${people} will be lost.`}
      onClose={onKeepReviewing}
      footer={
        <>
          <button type="button" onClick={onKeepReviewing} className={SECONDARY_BTN}>
            Keep reviewing
          </button>
          <button type="button" onClick={onCancelImport} className={PRIMARY_BTN}>
            Cancel import
          </button>
        </>
      }
    />
  );
}
