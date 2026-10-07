import { PromptDialog } from "../import/prompts/PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "../import/prompts/copy";

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  /** Cancel, × and Esc: close and stay where the user was. */
  onCancel: () => void;
  onConfirm: () => void;
}

// Shared by the desktop Profile "Logout" and the mobile header logout icon.
export function LogoutConfirmDialog({ isOpen, onCancel, onConfirm }: LogoutConfirmDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title="Log out of Unifolio?"
      body="Are you sure you want to log out of your account? You’ll need a code to sign back in."
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className={SECONDARY_BTN}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={PRIMARY_BTN}>
            Yes, log out
          </button>
        </>
      }
    />
  );
}
