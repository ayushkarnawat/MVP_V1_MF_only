import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface AddDetailsFirstDialogProps {
  isOpen: boolean;
  memberName: string;
  onAddDetails: () => void;
  /** Also the way out of ×. */
  onUploadDifferent: () => void;
}

// U6: every fund in the file belongs to a member who is still locked (M9).
export function AddDetailsFirstDialog({ isOpen, memberName, onAddDetails, onUploadDifferent }: AddDetailsFirstDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`Add ${memberName}’s details first`}
      body={`This statement is only ${memberName}’s. Add their relationship and PAN before importing their statement.`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
          <button type="button" onClick={onAddDetails} className={PRIMARY_BTN}>
            Add details now
          </button>
        </>
      }
    />
  );
}
