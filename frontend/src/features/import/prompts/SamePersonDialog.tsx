import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, panOrPlaceholder } from "./copy";

export interface SamePersonDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string | null;
  /** The name as the statement prints it; falls back to the member's name in capitals. */
  statementName?: string;
  /** "name_only" (staging-QA 5B): the member has no PAN at all, so there's no typed PAN to compare. */
  kind?: "typed_pan" | "name_only";
  memberFundCount?: number;
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
  kind = "typed_pan",
  memberFundCount = 0,
  onYes,
  onNo,
}: SamePersonDialogProps) {
  const statement = panOrPlaceholder(statementPanMasked);
  if (kind === "name_only") {
    const funds = `${memberFundCount} fund${memberFundCount === 1 ? "" : "s"}`;
    return (
      <PromptDialog
        isOpen={isOpen}
        title={`Is this the ${memberName} you already have?`}
        body={`This statement shows ${statementName ?? memberName} with PAN ${statement}. Your family list already has ${memberName} · PAN not on statement · ${funds}.`}
        onClose={onNo}
        footer={
          <>
            <button type="button" onClick={onNo} className={SECONDARY_BTN}>
              No, add as a new person
            </button>
            <button type="button" onClick={onYes} className={PRIMARY_BTN}>
              Yes, same person
            </button>
          </>
        }
      />
    );
  }
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
