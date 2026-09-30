import { PRIMARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface OtherAccountDialogProps {
  isOpen: boolean;
  memberName: string;
  /** "unlock" = L5 (after Continue), "picked" = L8 (picked from the dropdown). */
  variant: "unlock" | "picked";
  onOk: () => void;
}

// L5 / L8 (F37: they/their instead of the spec's he/his).
export function OtherAccountDialog({ isOpen, memberName, variant, onOk }: OtherAccountDialogProps) {
  const body =
    variant === "unlock"
      ? "Their funds stay in your family total. Their own dashboard stays with their account."
      : "Their funds are included in your family total. Their own dashboard stays with their account.";
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`${memberName} has their own Unifolio account`}
      body={body}
      onClose={onOk}
      footer={
        <button type="button" onClick={onOk} className={PRIMARY_BTN}>
          OK
        </button>
      }
    />
  );
}
