import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface ConfirmFailedDialogProps {
  isOpen: boolean;
  onTryAgain: () => void;
  /** Opens C3. Also the way out of ×. */
  onCancelImport: () => void;
  /** A 422 confirm_invalid: show the server's message with a single "Upload again" instead of the retry loop. */
  rejectedMessage?: string | null;
  onUploadAgain?: () => void;
}

// C1: any server error inside the Confirm transaction; nothing was written.
export function ConfirmFailedDialog({ isOpen, onTryAgain, onCancelImport, rejectedMessage, onUploadAgain }: ConfirmFailedDialogProps) {
  if (rejectedMessage && onUploadAgain) {
    return (
      <PromptDialog
        isOpen={isOpen}
        title="We couldn’t finish the import"
        body={rejectedMessage}
        onClose={onCancelImport}
        footer={
          <button type="button" onClick={onUploadAgain} className={PRIMARY_BTN}>
            Upload again
          </button>
        }
      />
    );
  }
  return (
    <PromptDialog
      isOpen={isOpen}
      title="We couldn’t finish the import"
      body="Nothing was saved. Your review choices are still here."
      onClose={onCancelImport}
      footer={
        <>
          <button type="button" onClick={onCancelImport} className={SECONDARY_BTN}>
            Cancel import
          </button>
          <button type="button" onClick={onTryAgain} className={PRIMARY_BTN}>
            Try again
          </button>
        </>
      }
    />
  );
}
