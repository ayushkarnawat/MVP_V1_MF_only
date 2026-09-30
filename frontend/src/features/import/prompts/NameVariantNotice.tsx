import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface NameVariantNoticeProps {
  isOpen: boolean;
  kind: "update" | "ask";
  firstUpload: boolean;
  currentName: string;
  statementName: string;
  /** Continue (kind "update") or Update (kind "ask"). */
  onAccept: () => void;
  /** Keep mine (kind "ask" only). */
  onKeep: () => void;
  /** Close (×) cancels the import: session discarded, back to the upload form. */
  onCancel: () => void;
}

// U1 (name slightly different) and its M8 ask mode (PAN matches, name completely different).
export function NameVariantNotice({
  isOpen,
  kind,
  firstUpload,
  currentName,
  statementName,
  onAccept,
  onKeep,
  onCancel,
}: NameVariantNoticeProps) {
  if (kind === "ask") {
    return (
      <PromptDialog
        isOpen={isOpen}
        title={`Update ${currentName} to ${statementName}?`}
        onClose={onCancel}
        footer={
          <>
            <button type="button" onClick={onKeep} className={SECONDARY_BTN}>
              Keep mine
            </button>
            <button type="button" onClick={onAccept} className={PRIMARY_BTN}>
              Update
            </button>
          </>
        }
      />
    );
  }
  const body = firstUpload
    ? `This statement says ${statementName}. You entered ${currentName}. We’ll update your name to match your statement.`
    : `This statement says ${statementName}. We have ${currentName}. We’ll update the name to match your statement.`;
  return (
    <PromptDialog
      isOpen={isOpen}
      title="The name on this statement is a little different"
      body={body}
      onClose={onCancel}
      footer={
        <button type="button" onClick={onAccept} className={PRIMARY_BTN}>
          Continue
        </button>
      }
    />
  );
}
