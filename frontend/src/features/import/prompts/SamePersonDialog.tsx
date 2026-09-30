import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, panOrPlaceholder } from "./copy";

export interface SamePersonDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string | null;
  /** The name as the statement prints it; falls back to the member's name in capitals. */
  statementName?: string;
  onYes: () => void;
  /** Also the way out of ×. */
  onNo: () => void;
}

// U13: an unlocked member's typed PAN is unverified and a statement shows a
// same-named person under a different PAN.
export function SamePersonDialog({
  isOpen,
  memberName,
  enteredPanMasked,
  statementPanMasked,
  statementName,
  onYes,
  onNo,
}: SamePersonDialogProps) {
  const statement = panOrPlaceholder(statementPanMasked);
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`Is this ${memberName}?`}
      body={`You entered ${enteredPanMasked} for ${memberName}. This statement shows ${statementName ?? memberName.toUpperCase()} with ${statement}.`}
      onClose={onNo}
      footer={
        <>
          <button type="button" onClick={onNo} className={SECONDARY_BTN}>
            No, this is someone else
          </button>
          <button type="button" onClick={onYes} className={PRIMARY_BTN}>
            {`Yes, use ${statement}`}
          </button>
        </>
      }
    />
  );
}
