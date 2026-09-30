import { useState } from "react";
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
export function NameMismatchDialog({
  isOpen,
  enteredName,
  statementName,
  error,
  onUseName,
  onUploadDifferent,
}: NameMismatchDialogProps) {
  const [name, setName] = useState(statementName);
  return (
    <PromptDialog
      isOpen={isOpen}
      title="This statement is in a different name"
      body={`You entered ${enteredName}, but this statement belongs to ${statementName}.`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={() => onUseName(name)} className={PRIMARY_BTN}>
            Use this name
          </button>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium text-[var(--color-ink)]">
        Your name as per PAN
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </PromptDialog>
  );
}
