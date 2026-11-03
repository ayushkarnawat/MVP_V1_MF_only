import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface NameMismatchDialogProps {
  isOpen: boolean;
  /** The account holder's name. It is never changed here. */
  enteredName: string;
  /** The person the statement is in. */
  statementName: string;
  /** Inline error from the server. */
  error?: string | null;
  onAddAsFamily: () => void;
  /** Also the way out of ×. */
  onUploadDifferent: () => void;
}

// U2: first import, no person in the file is compatible with the account holder's name.
// The account holder is never renamed: the person on the statement is added as a family member instead.
export function NameMismatchDialog({
  isOpen,
  enteredName,
  statementName,
  error,
  onAddAsFamily,
  onUploadDifferent,
}: NameMismatchDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`This is ${enteredName}’s account`}
      body={`You uploaded ${statementName}’s file. Do you want to add ${statementName} as a family member, or upload a different file?`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={onAddAsFamily} className={PRIMARY_BTN}>
            {`Add ${statementName} as a family member`}
          </button>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </PromptDialog>
  );
}
