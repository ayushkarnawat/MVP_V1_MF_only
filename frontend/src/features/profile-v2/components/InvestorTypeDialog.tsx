import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import type { InvestorType } from "@/features/auth/types";
import { INVESTOR_OPTIONS } from "../lib/onboardingOptions";

export interface InvestorTypeDialogProps {
  stored: string | null;
  onClose: () => void;
}

export function InvestorTypeDialog({ stored, onClose }: InvestorTypeDialogProps) {
  const { updateMe } = useAuth();
  const [choice, setChoice] = useState<InvestorType | null>(
    () => INVESTOR_OPTIONS.find(option => option.value === stored)?.value ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateMe({ investor_type: choice });
      onClose();
    } catch {
      setError("Could not save your investor type. Please try again.");
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="How do you invest today?">
      <div className="space-y-4">
        <p className="text-sm text-[var(--shell-text-body)]">
          This is your onboarding answer.
        </p>

        <div className="space-y-2">
          {INVESTOR_OPTIONS.map(option => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--ui-divider)] p-3 text-sm"
            >
              <input
                type="radio"
                name="investor-type"
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--ui-text)]">
                  {option.title}
                </span>
                <span className="block text-xs text-[var(--ui-text-muted)]">
                  {option.subtitle}
                </span>
              </span>
            </label>
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[var(--neg-text)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!choice || saving}
            className="rounded-lg bg-[var(--ui-text)] px-4 py-2 text-sm font-semibold text-[var(--ui-page)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
