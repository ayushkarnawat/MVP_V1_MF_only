import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, panOrPlaceholder } from "./copy";

export interface PanMismatchDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string | null;
  /** "The one I entered": discard, then the upload form shows uploadStatementShowingMessage(). Also ×. */
  onKeepEntered: () => void;
  /** "The one on this statement". */
  onUseStatement: () => void;
}

// U4: the PAN typed at unlock differs from the statement's PAN for that member.
export function PanMismatchDialog({
  isOpen,
  memberName,
  enteredPanMasked,
  statementPanMasked,
  onKeepEntered,
  onUseStatement,
}: PanMismatchDialogProps) {
  const statement = panOrPlaceholder(statementPanMasked);
  return (
    <PromptDialog
      isOpen={isOpen}
      title="This PAN doesn’t match what you entered"
      body={`You entered ${enteredPanMasked} for ${memberName} earlier. This statement shows ${statement}. Which one is correct?`}
      onClose={onKeepEntered}
      footer={
        <>
          <button type="button" onClick={onKeepEntered} className={SECONDARY_BTN}>
            {`The one I entered (${enteredPanMasked})`}
          </button>
          <button type="button" onClick={onUseStatement} className={PRIMARY_BTN}>
            {`The one on this statement (${statement})`}
          </button>
        </>
      }
    />
  );
}
