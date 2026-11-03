import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
import type { InvestorType, PrimaryGoal } from "../types";
import { AuthAlert } from "./AuthAlert";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { ChipCheckbox } from "./ChipCheckbox";
import {
  INVESTOR_PROFILE_OPTIONS, PROFILE_HEADLINE_ACCENT, PROFILE_HEADLINE_BEFORE, PROFILE_PARAGRAPH, PROFILE_ROWS,
} from "./finishCopy";
import { OptionRow } from "./OptionRow";

export interface InvestorProfileProps {
  /** Answers saved before (a return from a later screen, or a resumed session); empty for a new person. */
  initialInvestorType?: InvestorType | null;
  initialGoals?: PrimaryGoal[];
  /** May be async; a rejection is shown on the screen. */
  onSubmit: (values: { investorType: InvestorType; goals: PrimaryGoal[] }) => void | Promise<void>;
  /** Back to screen 3, where the name and the email can be changed. */
  onBack: () => void;
}

/** Sign-up screen 4. Both answers are required; nothing is pre-selected and there is no Skip (design Q12, Q67, Q68). */
export function InvestorProfile({ initialInvestorType = null, initialGoals = [], onSubmit, onBack }: InvestorProfileProps) {
  const [investorType, setInvestorType] = useState<InvestorType | null>(initialInvestorType);
  const [goals, setGoals] = useState<PrimaryGoal[]>(initialGoals);
  const [typeError, setTypeError] = useState(false);
  const [goalsError, setGoalsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const firstChip = useRef<HTMLButtonElement>(null);

  const allGoals = GOAL_OPTIONS.map((option) => option.value);
  const allChosen = allGoals.every((goal) => goals.includes(goal));
  const toggleGoal = (goal: PrimaryGoal) => {
    setGoalsError(false);
    setGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  };

  const submit = async () => {
    if (saving) return;
    const missingType = investorType === null;
    const missingGoals = goals.length === 0;
    setTypeError(missingType);
    setGoalsError(missingGoals);
    if (investorType === null || missingGoals) {
      (missingType ? firstOption : firstChip).current?.focus();
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await onSubmit({ investorType, goals });
    } catch {
      setSaveError("Couldn't save your answers. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthPage>
      <AuthSplitCard
        step={4}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="person"
            headline={<>{PROFILE_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{PROFILE_HEADLINE_ACCENT}</span></>}
            paragraph={PROFILE_PARAGRAPH}
            rows={PROFILE_ROWS}
          />
        }
        right={
          <div className="space-y-6 text-left">
            <section className="space-y-3">
              <div className="space-y-1">
                <h1 className="text-[22px] font-bold leading-tight text-[var(--ui-text)]">How do you usually invest?</h1>
                <p className="text-sm text-[var(--ui-text-muted)]">This helps us tailor your experience and insights.</p>
              </div>
              <div role="radiogroup" aria-label="How do you usually invest?" className="space-y-2">
                {INVESTOR_PROFILE_OPTIONS.map((option, index) => (
                  <OptionRow
                    key={option.value}
                    ref={index === 0 ? firstOption : undefined}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={investorType === option.value}
                    onSelect={() => {
                      setInvestorType(option.value);
                      setTypeError(false);
                    }}
                  />
                ))}
              </div>
              {typeError ? <p role="alert" className="text-xs text-[var(--neg-text)]">Choose how you usually invest.</p> : null}
            </section>
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-[var(--ui-text)]">
                  What are you working towards? <span className="text-xs font-normal text-[var(--ui-text-muted)]">(Select all that apply)</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setGoalsError(false);
                    setGoals(allChosen ? [] : [...allGoals]);
                  }}
                  className="shrink-0 text-xs font-semibold text-[var(--pos-text)] hover:underline"
                >
                  {allChosen ? "Clear all" : "Select all"}
                </button>
              </div>
              <div role="group" aria-label="What are you working towards?" className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((option, index) => (
                  <ChipCheckbox
                    key={option.value}
                    ref={index === 0 ? firstChip : undefined}
                    label={option.title}
                    checked={goals.includes(option.value)}
                    onToggle={() => toggleGoal(option.value)}
                  />
                ))}
              </div>
              {goalsError ? <p role="alert" className="text-xs text-[var(--neg-text)]">Choose at least one goal.</p> : null}
            </section>
            {saveError ? <AuthAlert tone="error">{saveError}</AuthAlert> : null}
            <Button type="button" onClick={() => void submit()} disabled={saving} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
