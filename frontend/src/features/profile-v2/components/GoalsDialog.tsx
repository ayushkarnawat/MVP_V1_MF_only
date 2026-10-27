import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import type { PrimaryGoal } from "@/features/auth/types";
import { mergeGoals } from "../lib/goalChips";
import { GOAL_OPTIONS } from "../lib/onboardingOptions";

export interface GoalsDialogProps {
  stored: readonly string[] | null | undefined;
  onClose: () => void;
}

export function GoalsDialog({ stored, onClose }: GoalsDialogProps) {
  const { updateMe } = useAuth();
  const [selected, setSelected] = useState<PrimaryGoal[]>(() =>
    GOAL_OPTIONS.map(option => option.value).filter(value =>
      stored?.includes(value)
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (value: PrimaryGoal) => {
    setSelected(current =>
      current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value]
    );
  };

  const toggleAll = () => {
    if (selected.length === GOAL_OPTIONS.length) {
      setSelected([]);
    } else {
      setSelected(GOAL_OPTIONS.map(option => option.value));
    }
  };

  const handleSave = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Cast is required because UpdateMeBody specifies known PrimaryGoal union types
      await updateMe({
        primary_goals: mergeGoals(stored, selected) as PrimaryGoal[],
      });
      onClose();
    } catch {
      setError("Could not save your goals. Please try again.");
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="What brings you to Unifolio?">
      <div className="space-y-4">
        <p className="text-sm text-[var(--shell-text-body)]">
          Pick all that apply. These are your onboarding answers.
        </p>

        <div className="space-y-2">
          {GOAL_OPTIONS.map(option => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--ui-divider)] p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
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

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-semibold text-[var(--pos-text)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Why choose? All of it.
          </button>
          {selected.length === 0 ? (
            <p className="text-xs text-[var(--ui-text-muted)]">
              Choose at least one goal.
            </p>
          ) : null}
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
            disabled={selected.length === 0 || saving}
            className="rounded-lg bg-[var(--ui-text)] px-4 py-2 text-sm font-semibold text-[var(--ui-page)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
