import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface PossibleDuplicateDialogProps {
  isOpen: boolean;
  memberName: string;
  otherMemberName: string;
  /** F24: source_fund_count from the 409 details. */
  fundCount: number;
  merging?: boolean;
  error?: string | null;
  onMerge: () => void;
  /** Also the way out of ×. */
  onCheckPan: () => void;
}

// L4: the typed PAN is already on another member of this account.
export function PossibleDuplicateDialog({
  isOpen, memberName, otherMemberName, fundCount, merging, error, onMerge, onCheckPan,
}: PossibleDuplicateDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`This PAN is already on ${otherMemberName}`}
      body={`${memberName} and ${otherMemberName} may be the same person. Merging moves ${memberName}’s ${fundCount} fund${fundCount === 1 ? "" : "s"} into ${otherMemberName} and removes ${memberName} from your family list.`}
      onClose={onCheckPan}
      footer={
        <>
          <button type="button" onClick={onCheckPan} className={SECONDARY_BTN}>
            Check the PAN
          </button>
          <button type="button" onClick={onMerge} disabled={merging} className={PRIMARY_BTN}>
            Merge into {otherMemberName}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="text-sm text-[var(--color-negative,#b91c1c)]">{error}</p>}
    </PromptDialog>
  );
}
