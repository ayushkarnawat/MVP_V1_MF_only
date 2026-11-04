import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  BarChart3,
  Briefcase,
  FileText,
  GraduationCap,
  Home,
  Sprout,
  Sun,
  Umbrella,
  Users,
} from "lucide-react";
import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
import type { InvestorType, PrimaryGoal } from "../types";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { PROFILE_ROW_ICONS } from "./authRowIcons";
import { ChipCheckbox } from "./ChipCheckbox";
import {
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

const INVESTOR_ICONS: Record<InvestorType, ReactNode> = {
  beginner: <Sprout aria-hidden="true" />,
  self_directed: <BarChart3 aria-hidden="true" />,
  advisor_assisted: <Users aria-hidden="true" />,
  mixed: <Briefcase aria-hidden="true" />,
};

const GOAL_ICONS: Record<PrimaryGoal, ReactNode> = {
  wealth_creation: <BarChart3 size={20} aria-hidden="true" />,
  retirement: <Umbrella size={20} aria-hidden="true" />,
  childrens_education: <GraduationCap size={20} aria-hidden="true" />,
  buy_home: <Home size={20} aria-hidden="true" />,
  financial_freedom: <Sun size={20} aria-hidden="true" />,
  tax_planning: <FileText size={20} aria-hidden="true" />,
};

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
          <div className="flex flex-col gap-[var(--auth-gap)] text-left">
            <section className="flex flex-col gap-[var(--auth-gap-sm)]">
              <div className="flex flex-col gap-1">
                <h1 className="auth-h1">How do you usually invest?</h1>
                <p className="auth-sub">This helps us tailor your experience and insights.</p>
              </div>
              <div role="radiogroup" aria-label="How do you usually invest?" className="flex flex-col gap-[var(--auth-gap-sm)]">
                {INVESTOR_PROFILE_OPTIONS.map((option, index) => (
                  <OptionRow
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                      if (index === 0) firstOption.current = node;
                    }}
                    tabStop={index === stopIndex}
                    onKeyDown={(event) => moveOption(event, index)}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={investorType === option.value}
                    icon={INVESTOR_ICONS[option.value]}
                    onSelect={() => {
                      setInvestorType(option.value);
                      setTypeError(false);
                    }}
                  />
                ))}
              </div>
              {typeError ? <p role="alert" className="text-[13px] text-[var(--neg-text)]">Choose how you usually invest.</p> : null}
            </section>
            <section className="flex flex-col gap-[var(--auth-gap-sm)]">
              <div className="flex items-center justify-between gap-3 whitespace-nowrap">
                <h2 className="text-[15px] font-semibold text-[var(--auth-ink)]">
                  What are you working towards? <span className="ml-1 text-[13px] font-normal text-[var(--auth-muted)]">(Select all that apply)</span>
                </h2>
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
              <div role="group" aria-label="What are you working towards?" className="grid grid-cols-3 gap-[var(--auth-gap-sm)]">
                {GOAL_OPTIONS.map((option, index) => (
                  <ChipCheckbox
                    key={option.value}
                    ref={index === 0 ? firstChip : undefined}
                    label={option.title}
                    checked={goals.includes(option.value)}
                    icon={GOAL_ICONS[option.value]}
                    onToggle={() => toggleGoal(option.value)}
                  />
                ))}
              </div>
              {goalsError ? <p role="alert" className="text-[13px] text-[var(--neg-text)]">Choose at least one goal.</p> : null}
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
