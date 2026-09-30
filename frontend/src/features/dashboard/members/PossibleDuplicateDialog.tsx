import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface PossibleDuplicateDialogProps {
  isOpen: boolean;
  memberName: string;
  otherMemberName: string;
  /** F24: source_fund_count from the 409 details. */
  fundCount: number;
  /** Staging-QA 5C: the source's masked detected PAN or "PAN not on statement". */
  sourcePanLabel?: string;
  merging?: boolean;
  error?: string | null;
  onMerge: () => void;
  /** Also the way out of ×. */
  onCheckPan: () => void;
}

// L4: the typed PAN is already on another member of this account.
export function PossibleDuplicateDialog({
  isOpen, memberName, otherMemberName, fundCount, sourcePanLabel = "PAN not on statement",
  merging, error, onMerge, onCheckPan,
}: PossibleDuplicateDialogProps) {
  // Same name on both sides (staging-QA 5C): "Kavita and Kavita" says nothing,
  // so label each by what tells them apart.
  const same = memberName === otherMemberName;
  const funds = `${fundCount} fund${fundCount === 1 ? "" : "s"}`;
  const body = same
    ? `${memberName} (${sourcePanLabel}, ${funds}) and ${otherMemberName} (already on your dashboard) may be the same person. Merging moves the ${funds} into the one on your dashboard and removes the duplicate.`
    : `${memberName} and ${otherMemberName} may be the same person. Merging moves ${memberName}’s ${funds} into ${otherMemberName} and removes ${memberName} from your family list.`;
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`This PAN is already on ${otherMemberName}`}
      body={body}
      onClose={onCheckPan}
      footer={
        <>
          <button type="button" onClick={onCheckPan} className={SECONDARY_BTN}>
            Check the PAN
          </button>
          <button type="button" onClick={onMerge} disabled={merging} className={PRIMARY_BTN}>
            {same ? "Merge them" : `Merge into ${otherMemberName}`}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="text-sm text-[var(--color-negative,#b91c1c)]">{error}</p>}
    </PromptDialog>
  );
}
