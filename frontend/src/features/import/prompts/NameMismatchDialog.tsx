import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface NameMismatchDialogProps {
  isOpen: boolean;
  enteredName: string;
  statementName: string;
  /** Inline error from the server, e.g. “This name doesn’t match the statement”. */
  error?: string | null;
  onUseName: (name: string) => void;
  /** Also the way out of ×. */
  onUploadDifferent: () => void;
}

// U2: first import, no person in the file is compatible with the onboarding name.
// The name comes from the statement and is never typed here: the user only confirms it is them.
export function NameMismatchDialog({
  isOpen,
  enteredName,
  statementName,
  error,
  onUseName,
  onUploadDifferent,
}: NameMismatchDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`This statement is in ${statementName}’s name`}
      body={`You entered ${enteredName}. Is that you?`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={() => onUseName(statementName)} className={PRIMARY_BTN}>
            Yes, that’s me
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
