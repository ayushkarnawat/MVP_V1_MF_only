import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN } from "./copy";

export interface SessionExpiredDialogProps {
  isOpen: boolean;
  /** Also the way out of ×. */
  onUploadAgain: () => void;
}

// C2: review older than 60 minutes, or a redeploy emptied the task's memory (410).
export function SessionExpiredDialog({ isOpen, onUploadAgain }: SessionExpiredDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title="This review has expired"
      body="Reviews stay open for 60 minutes. Nothing was saved. Upload the statement again to continue."
      onClose={onUploadAgain}
      footer={
        <button type="button" onClick={onUploadAgain} className={PRIMARY_BTN}>
          Upload again
        </button>
      }
    />
  );
}
