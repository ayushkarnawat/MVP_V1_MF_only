import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { currentStep, goBack, goNext, initHistory, isSkipped, markAnswered, skipToNext } from "./onboardingHistory";
import type { HistoryState } from "./onboardingHistory";
import { isOnboardingStep } from "./onboardingSteps";
import type { OnboardingStep } from "./onboardingSteps";
import { Q1Name } from "./Q1Name";
import { Q2Investing } from "./Q2Investing";
import { Q3Purpose } from "./Q3Purpose";
import { OnboardingCardStack } from "./OnboardingCardStack";
import { SoloCasUpload } from "./SoloCasUpload";
import { createHouseholdMember } from "./api";
import type { InvestorType, MeResponse, PrimaryGoal } from "./types";

export interface OnboardingAnswers {
  name: string;
  investorType: InvestorType | null;
  primaryGoals: PrimaryGoal[];
}

// 2026-10-01: the privacy screen ("trust_primer") is gone. Users who stopped
// on it resume at their first unsaved answer (name -> investing -> goals),
// else Upload. The name check runs for every resume: the name step has no
// Skip, so a missing name always means it was never saved. The investing and
// goal checks run only for the old trust_primer value, because a skipped
// question also saves null and would otherwise be re-asked on every return
// (decision QF accepts one re-ask for those users).
export function resumeStep(me: MeResponse | null | undefined): OnboardingStep {
  const step = me?.onboarding_step;
  if (step === "trust_primer") {
    if (!me?.self_name) return "q1_name";
    if (!me.investor_type) return "q2_investing";
    if (!me.primary_goals || me.primary_goals.length === 0) return "q3_purpose";
    return "cas_upload";
  }
  if (!isOnboardingStep(step) || step === "done") return "q1_name";
  const pastName = step === "q2_investing" || step === "q3_purpose" || step === "cas_upload";
  if (pastName && !me?.self_name) return "q1_name";
  return step;
}

interface OnboardingFlowProps {
  isMobile?: boolean;
}

export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
  const { me, updateMe } = useAuth();
  const [history, setHistory] = useState<HistoryState>(() => initHistory(resumeStep(me)));
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    name: me?.self_name ?? "",
    investorType: me?.investor_type ?? null,
    primaryGoals: me?.primary_goals ?? [],
  }));

  const step = currentStep(history);

  useEffect(() => {
    if (step !== "done") {
      void updateMe({ onboarding_step: step });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const advance = (next: OnboardingStep) => setHistory((h) => goNext(markAnswered(h), next));
  const back = () => setHistory((h) => goBack(h));
  const skip = (next: OnboardingStep) => setHistory((h) => skipToNext(h, next));
  const showBack = history.cursor > 0;

  // Saved here, not at upload, so a user who leaves after the name step
  // resumes with a self member. A rejection propagates to Q1Name, which keeps
  // the step in place and shows the error.
  const submitName = async (name: string) => {
    await createHouseholdMember(name, "self");
    setAnswers((a) => ({ ...a, name }));
    advance("q2_investing");
  };

  const renderStep = () => {
    if (step === "q1_name") {
      return isMobile ? (
        <Q1Name
          isMobile
          currentStepIndex={0}
          totalSteps={4}
          value={answers.name}
          onBack={showBack ? back : undefined}
          onSubmit={submitName}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={0} totalSteps={4}>
          <Q1Name
            value={answers.name}
            onBack={showBack ? back : undefined}
            onSubmit={submitName}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "q2_investing") {
      return isMobile ? (
        <Q2Investing
          isMobile
          currentStepIndex={1}
          totalSteps={4}
          selectedValue={answers.investorType}
          onBack={back}
          onSkip={() => skip("q3_purpose")}
          onSelect={(investorType) => {
            void updateMe({ investor_type: investorType });
            setAnswers((a) => ({ ...a, investorType }));
            advance("q3_purpose");
          }}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={1} totalSteps={4}>
          <Q2Investing
            selectedValue={answers.investorType}
            onBack={back}
            onSkip={() => skip("q3_purpose")}
            onSelect={(investorType) => {
              void updateMe({ investor_type: investorType });
              setAnswers((a) => ({ ...a, investorType }));
              advance("q3_purpose");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "q3_purpose") {
      return isMobile ? (
        <Q3Purpose
          isMobile
          currentStepIndex={2}
          totalSteps={4}
          selectedValues={answers.primaryGoals}
          onBack={back}
          onSkip={() => skip("cas_upload")}
          onContinue={(primaryGoals) => {
            void updateMe({ primary_goals: primaryGoals });
            setAnswers((a) => ({ ...a, primaryGoals }));
            advance("cas_upload");
          }}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={2} totalSteps={4}>
          <Q3Purpose
            selectedValues={answers.primaryGoals}
            onBack={back}
            onSkip={() => skip("cas_upload")}
            onContinue={(primaryGoals) => {
              void updateMe({ primary_goals: primaryGoals });
              setAnswers((a) => ({ ...a, primaryGoals }));
              advance("cas_upload");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "cas_upload") {
      return (
        <div className="w-full min-h-dvh bg-[var(--color-bg)] flex flex-col justify-start items-center p-2 sm:p-6 lg:p-8 box-border">
          <div className="w-full max-w-[1600px] mx-auto">
            <SoloCasUpload name={answers.name} />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative w-full min-h-full flex flex-col flex-1">
      {renderStep()}
    </div>
  );
}

export { isSkipped };
