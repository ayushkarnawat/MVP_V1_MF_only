import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN, panOrPlaceholder } from "./copy";

export interface WhichIsYouCandidate {
  person_key: string;
  name: string;
  pan_masked: string | null;
}

export interface WhichIsYouDialogProps {
  isOpen: boolean;
  candidates: WhichIsYouCandidate[];
  onContinue: (personKey: string) => void;
  /** Also the way out of × (goes on to U2). */
  onNoneOfThese: () => void;
}

// U3: the onboarding name is compatible with more than one person in the file.
export function WhichIsYouDialog({ isOpen, candidates, onContinue, onNoneOfThese }: WhichIsYouDialogProps) {
  const [picked, setPicked] = useState<string>(candidates[0]?.person_key ?? "");
  return (
    <PromptDialog
      isOpen={isOpen}
      title="Which one is you?"
      onClose={onNoneOfThese}
      footer={
        <>
          <button type="button" onClick={onNoneOfThese} className={SECONDARY_BTN}>
            None of these
          </button>
          <button type="button" disabled={!picked} onClick={() => onContinue(picked)} className={PRIMARY_BTN}>
            Continue
          </button>
        </>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-2">
        {candidates.map((c) => (
          <label key={c.person_key} className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <input
              type="radio"
              name="which-is-you"
              checked={picked === c.person_key}
              onChange={() => setPicked(c.person_key)}
            />
            <span>{`${c.name} · ${panOrPlaceholder(c.pan_masked)}`}</span>
          </label>
        ))}
      </div>
    </PromptDialog>
  );
}
