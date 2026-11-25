import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
import { GOAL_TILE_ICONS, INVESTOR_TYPE_ICONS } from "../onboardingIcons";
import type { InvestorType, PrimaryGoal } from "../types";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AuthInlineError } from "./AuthInlineError";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { PROFILE_ROW_ICONS } from "./authRowIcons";
import { ChipCheckbox } from "./ChipCheckbox";
import {
  INVESTOR_GOAL_TITLE_OVERRIDES,
  INVESTOR_PROFILE_OPTIONS,
  PROFILE_HEADLINE_ACCENT,
  PROFILE_HEADLINE_BEFORE,
  PROFILE_PARAGRAPH,
  PROFILE_ROWS,
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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const firstChip = useRef<HTMLButtonElement>(null);

  const allGoals = GOAL_OPTIONS.map((option) => option.value);
  const allChosen = allGoals.every((goal) => goals.includes(goal));
  const toggleGoal = (goal: PrimaryGoal) => {
    setGoalsError(false);
    setGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  };

  // A radio group is one Tab stop (the chosen answer, or the first when none is chosen); the arrow keys move and choose.
  const stopIndex = Math.max(0, INVESTOR_PROFILE_OPTIONS.findIndex((option) => option.value === investorType));
  const moveOption = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = INVESTOR_PROFILE_OPTIONS.length - 1;
    let to = from;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = from === last ? 0 : from + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = from === 0 ? last : from - 1;
    else return;
    event.preventDefault();
    setInvestorType(INVESTOR_PROFILE_OPTIONS[to].value);
    setTypeError(false);
    optionRefs.current[to]?.focus();
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
        dense={typeError || goalsError || saveError !== null}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="person"
            headline={<>{PROFILE_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{PROFILE_HEADLINE_ACCENT}</span></>}
            paragraph={PROFILE_PARAGRAPH}
            rows={PROFILE_ROWS}
            rowIcons={PROFILE_ROW_ICONS}
          />
        }
        right={
          <div className="flex flex-col gap-[calc(var(--auth-gap)+6px)] text-left">
            <section className="flex flex-col gap-[calc(var(--auth-gap-sm)+3px)]">
              <h1 className="auth-h1">How do you usually invest?</h1>
              <div
                role="radiogroup"
                aria-label="How do you usually invest?"
                data-invalid={typeError ? "true" : undefined}
                className="auth-option-group flex flex-col overflow-hidden"
              >
                {INVESTOR_PROFILE_OPTIONS.map((option, index) => {
                  const Icon = INVESTOR_TYPE_ICONS[option.value];
                  return (
                    <OptionRow
                      key={option.value}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                        if (index === 0) firstOption.current = node;
                      }}
                      tabStop={index === stopIndex}
                      onKeyDown={(event) => moveOption(event, index)}
                      title={option.title}
                      selected={investorType === option.value}
                      icon={<Icon aria-hidden="true" />}
                      divider={index < INVESTOR_PROFILE_OPTIONS.length - 1}
                      onSelect={() => {
                        setInvestorType(option.value);
                        setTypeError(false);
                      }}
                    />
                  );
                })}
              </div>
              {typeError ? <AuthInlineError>Choose how you usually invest.</AuthInlineError> : null}
            </section>
            <section className="flex flex-col gap-[calc(var(--auth-gap-sm)+3px)]">
              <div className="flex items-center justify-between gap-3 whitespace-nowrap">
                <h2 className="text-[15px] font-semibold text-[var(--auth-ink)]">What are you working towards?</h2>
                <button
                  type="button"
                  onClick={() => {
                    setGoalsError(false);
                    setGoals(allChosen ? [] : [...allGoals]);
                  }}
                  className="shrink-0 text-[13px] font-semibold text-[var(--auth-green-ink)] hover:underline"
                >
                  {allChosen ? "Clear all" : "Select all"}
                </button>
              </div>
              <p className="text-[12.5px] leading-[1.2] text-[var(--auth-muted)]">(Select all that apply)</p>
              <div role="group" aria-label="What are you working towards?" className="grid grid-cols-2 gap-[calc(var(--auth-gap-sm)+3px)]">
                {GOAL_OPTIONS.map((option, index) => {
                  const Icon = GOAL_TILE_ICONS[option.value];
                  return (
                    <ChipCheckbox
                      key={option.value}
                      ref={index === 0 ? firstChip : undefined}
                      label={INVESTOR_GOAL_TITLE_OVERRIDES[option.value] ?? option.title}
                      checked={goals.includes(option.value)}
                      icon={<Icon aria-hidden="true" />}
                      invalid={goalsError}
                      onToggle={() => toggleGoal(option.value)}
                    />
                  );
                })}
              </div>
              {goalsError ? <AuthInlineError>Choose at least one goal.</AuthInlineError> : null}
            </section>
            {saveError ? <AuthAlert tone="error">{saveError}</AuthAlert> : null}
            <AuthButton type="button" onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </AuthButton>
          </div>
        }
      />
    </AuthPage>
  );
}
