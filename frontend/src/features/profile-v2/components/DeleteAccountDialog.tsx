import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import type { AccountDeletionReason } from "@/features/auth/types";

export interface DeleteAccountDialogProps {
  onClose: () => void;
}

const REASONS: { value: AccountDeletionReason; label: string }[] = [
  { value: "not_using_enough", label: "Not using it enough" },
  { value: "missing_feature", label: "Missing a feature" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "data_or_trust_concern", label: "Data or trust concern" },
  { value: "other", label: "Other" },
];

export function DeleteAccountDialog({ onClose }: DeleteAccountDialogProps) {
  const { requestAccountDeletion } = useAuth();

  const [step, setStep] = useState<"survey" | "confirm">("survey");
  const [reason, setReason] = useState<AccountDeletionReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Closing while the request is out would look like "cancel" although the deletion still gets scheduled.
  const close = () => {
    if (submitting) return;
    onClose();
  };

  const confirm = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestAccountDeletion(reason, feedback);
      onClose();
    } catch {
      setError("Could not schedule account deletion. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={close} title={step === "survey" ? "Why are you leaving?" : "Confirm account deletion"}>
      {step === "survey" ? (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-[var(--ui-text)]">
              Choose one reason
            </legend>
            {REASONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ui-divider)] p-3 text-sm text-[var(--ui-text)]"
              >
                <input
                  type="radio"
                  name="deletion-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="block space-y-1.5 text-sm font-semibold text-[var(--ui-text)]">
            <span>
              Anything else? <span className="font-normal text-[var(--ui-text-muted)]">Optional</span>
            </span>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              className="min-h-24 w-full rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3 py-2 text-sm font-normal text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            />
          </label>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={close}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!reason}
              onClick={() => setStep("confirm")}
              className="rounded-lg bg-[var(--ui-text)] px-4 py-2 text-sm font-semibold text-[var(--ui-page)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[var(--shell-text-body)]">
            Your account and all household data will be permanently deleted in 30 days. You can cancel anytime before then.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-[var(--neg-text)]">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={close}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={confirm}
              className="rounded-lg bg-[var(--neg-text)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              {submitting ? "Scheduling…" : "Confirm deletion"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
