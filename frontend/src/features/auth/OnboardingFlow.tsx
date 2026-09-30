import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { currentStep, goBack, goNext, initHistory, isSkipped, markAnswered, skipToNext } from "./onboardingHistory";
import type { HistoryState } from "./onboardingHistory";
import { isOnboardingStep } from "./onboardingSteps";
import type { OnboardingStep } from "./onboardingSteps";
import { TrustPrimer } from "./TrustPrimer";
import { Q1Name } from "./Q1Name";
import { Q2Investing } from "./Q2Investing";
import { Q3Purpose } from "./Q3Purpose";
import { OnboardingCardStack } from "./OnboardingCardStack";
import { SoloCasUpload } from "./SoloCasUpload";
import type { InvestorType, PrimaryGoal } from "./types";

export interface OnboardingAnswers {
  name: string;
  investorType: InvestorType | null;
  primaryGoals: PrimaryGoal[];
}

const INITIAL_ANSWERS: OnboardingAnswers = {
  name: "",
  investorType: null,
  primaryGoals: [],
};

function resumeStep(step: string | null | undefined): OnboardingStep {
  return isOnboardingStep(step) && step !== "done" ? step : "q1_name";
}

interface OnboardingFlowProps {
  isMobile?: boolean;
}

export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
  const { me, updateMe } = useAuth();
  const [history, setHistory] = useState<HistoryState>(() => initHistory(resumeStep(me?.onboarding_step)));
  const [answers, setAnswers] = useState<OnboardingAnswers>(INITIAL_ANSWERS);

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

  const renderStep = () => {
    if (step === "q1_name") {
      return isMobile ? (
        <Q1Name
          isMobile
          currentStepIndex={0}
          totalSteps={5}
          value={answers.name}
          onBack={showBack ? back : undefined}
          onSubmit={(name) => {
            setAnswers((a) => ({ ...a, name }));
            advance("q2_investing");
          }}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={0} totalSteps={5}>
          <Q1Name
            value={answers.name}
            onBack={showBack ? back : undefined}
            onSubmit={(name) => {
              setAnswers((a) => ({ ...a, name }));
              advance("q2_investing");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "q2_investing") {
      return isMobile ? (
        <Q2Investing
          isMobile
          currentStepIndex={1}
          totalSteps={5}
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
        <OnboardingCardStack history={history} currentStepIndex={1} totalSteps={5}>
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
          totalSteps={5}
          selectedValues={answers.primaryGoals}
          onBack={back}
          onSkip={() => skip("trust_primer")}
          onContinue={(primaryGoals) => {
            void updateMe({ primary_goals: primaryGoals });
            setAnswers((a) => ({ ...a, primaryGoals }));
            advance("trust_primer");
          }}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={2} totalSteps={5}>
          <Q3Purpose
            selectedValues={answers.primaryGoals}
            onBack={back}
            onSkip={() => skip("trust_primer")}
            onContinue={(primaryGoals) => {
              void updateMe({ primary_goals: primaryGoals });
              setAnswers((a) => ({ ...a, primaryGoals }));
              advance("trust_primer");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "trust_primer") {
      return isMobile ? (
        <TrustPrimer
          isMobile
          currentStepIndex={3}
          totalSteps={5}
          onBack={back}
          onContinue={() => advance("cas_upload")}
        />
      ) : (
        <OnboardingCardStack history={history} currentStepIndex={3} totalSteps={5}>
          <TrustPrimer
            onBack={back}
            onContinue={() => advance("cas_upload")}
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
