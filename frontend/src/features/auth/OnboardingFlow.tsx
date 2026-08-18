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
import { Q4Household } from "./Q4Household";
import { OnboardingCardStack } from "./OnboardingCardStack";
import { AddFamilyMembers } from "./AddFamilyMembers";
import { SoloCasUpload } from "./SoloCasUpload";
import { FamilyImportFlow } from "./FamilyImportFlow";
import { ThemeToggle } from "../../components/ThemeToggle";
import type { HouseholdMember, InvestorType, PrimaryGoal } from "./types";

export interface OnboardingAnswers {
  name: string;
  investorType: InvestorType | null;
  primaryGoal: PrimaryGoal | null;
  familyMembers: HouseholdMember[];
}

const INITIAL_ANSWERS: OnboardingAnswers = {
  name: "",
  investorType: null,
  primaryGoal: null,
  familyMembers: [],
};

function resumeStep(step: string | null | undefined): OnboardingStep {
  return isOnboardingStep(step) && step !== "done" ? step : "trust_primer";
}

export function OnboardingFlow() {
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
    if (step === "trust_primer") {
      return (
        <OnboardingCardStack history={history}>
          <TrustPrimer onContinue={() => advance("q1_name")} />
        </OnboardingCardStack>
      );
    }

    if (step === "q1_name") {
      return (
        <OnboardingCardStack history={history}>
          <Q1Name
            value={answers.name}
            onBack={showBack ? back : undefined}
            onSkip={() => skip("q2_investing")}
            onSubmit={(name) => {
              setAnswers((a) => ({ ...a, name }));
              advance("q2_investing");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "q2_investing") {
      return (
        <OnboardingCardStack history={history}>
          <Q2Investing
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
      return (
        <OnboardingCardStack history={history}>
          <Q3Purpose
            onBack={back}
            onSkip={() => skip("q4_household")}
            onSelect={(primaryGoal) => {
              void updateMe({ primary_goal: primaryGoal });
              setAnswers((a) => ({ ...a, primaryGoal }));
              advance("q4_household");
            }}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "q4_household") {
      return (
        <OnboardingCardStack history={history}>
          <Q4Household
            onBack={back}
            onChooseSolo={() => advance("cas_upload")}
            onChooseFamily={() => advance("add_family")}
          />
        </OnboardingCardStack>
      );
    }

    if (step === "add_family") {
      return (
        <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-y-auto">
          <div className="w-full max-w-lg mx-auto my-auto">
            <AddFamilyMembers
              members={answers.familyMembers}
              onMembersChange={(familyMembers) => setAnswers((a) => ({ ...a, familyMembers }))}
              onBack={back}
              onContinue={() => advance("family_cas_upload")}
            />
          </div>
        </div>
      );
    }

    if (step === "cas_upload") {
      return (
        <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-y-auto">
          <div className="w-full max-w-xl mx-auto my-auto">
            <SoloCasUpload name={answers.name} />
          </div>
        </div>
      );
    }

    if (step === "family_cas_upload" || step === "upload_my_cas" || step === "parse_queue") {
      return (
        <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-y-auto">
          <div className="w-full max-w-xl mx-auto my-auto">
            <FamilyImportFlow selfName={answers.name} />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative w-full min-h-dvh">
      {/* Top Right Theme Toggle visible across all onboarding screens */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <ThemeToggle />
      </div>
      {renderStep()}
    </div>
  );
}

export { isSkipped };
