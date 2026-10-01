import { PRIMARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface OtherAccountDialogProps {
  isOpen: boolean;
  memberName: string;
  onOk: () => void;
}

// Spec mock 8: shown after every Save that leaves the PAN on another account (Q3).
export function OtherAccountDialog({ isOpen, memberName, onOk }: OtherAccountDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`${memberName}’s details are saved`}
      onClose={onOk}
      footer={
        <button type="button" onClick={onOk} className={PRIMARY_BTN}>
          OK
        </button>
      }
    >
      <div role="alert" className="rounded-lg border border-[var(--color-negative,#b91c1c)] px-3 py-2 text-sm text-[var(--color-ink)]">
        <p className="m-0 font-semibold text-[var(--color-negative,#b91c1c)]">Their profile can’t be completed here</p>
        <p className="m-0 mt-1">
          {`${memberName}’s PAN is already tracked under another Unifolio account, so it can’t be added to yours. Their relationship, phone and email are saved.`}
        </p>
      </div>
    </PromptDialog>
  );
}
