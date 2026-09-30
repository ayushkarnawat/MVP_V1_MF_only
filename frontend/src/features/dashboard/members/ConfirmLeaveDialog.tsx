import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export interface ConfirmLeaveDialogProps {
  isOpen: boolean;
  memberName: string;
  onEnterDetails: () => void;
  /** Also the way out of ×. */
  onBackToDashboard: () => void;
}

// L6: Cancel in the unlock popup.
export function ConfirmLeaveDialog({ isOpen, memberName, onEnterDetails, onBackToDashboard }: ConfirmLeaveDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`Skip adding ${memberName}’s details?`}
      body={`You can’t open ${memberName}’s dashboard until these details are added. You can add them any time by picking ${memberName} from the member list.`}
      onClose={onBackToDashboard}
      footer={
        <>
          <button type="button" onClick={onBackToDashboard} className={SECONDARY_BTN}>
            Back to dashboard
          </button>
          <button type="button" onClick={onEnterDetails} className={PRIMARY_BTN}>
            Enter details
          </button>
        </>
      }
    />
  );
}
