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
import { AddFamilyMembers } from "./AddFamilyMembers";
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

  if (step === "trust_primer") {
    return <TrustPrimer onContinue={() => advance("q1_name")} />;
  }

  if (step === "q1_name") {
    return (
      <Q1Name
        value={answers.name}
        onBack={showBack ? back : undefined}
        onSkip={() => skip("q2_investing")}
        onSubmit={(name) => {
          setAnswers((a) => ({ ...a, name }));
          advance("q2_investing");
        }}
      />
    );
  }

  if (step === "q2_investing") {
    return (
      <Q2Investing
        onBack={back}
        onSkip={() => skip("q3_purpose")}
        onSelect={(investorType) => {
          setAnswers((a) => ({ ...a, investorType }));
          advance("q3_purpose");
        }}
      />
    );
  }

  if (step === "q3_purpose") {
    return (
      <Q3Purpose
        onBack={back}
        onSkip={() => skip("q4_household")}
        onSelect={(primaryGoal) => {
          setAnswers((a) => ({ ...a, primaryGoal }));
          advance("q4_household");
        }}
      />
    );
  }

  if (step === "q4_household") {
    return (
      <Q4Household
        onBack={back}
        onChooseSolo={() => advance("cas_upload")}
        onChooseFamily={() => advance("add_family")}
      />
    );
  }

  if (step === "add_family") {
    return (
      <AddFamilyMembers
        members={answers.familyMembers}
        onMembersChange={(familyMembers) => setAnswers((a) => ({ ...a, familyMembers }))}
        onBack={back}
        onContinue={() => advance("family_cas_upload")}
      />
    );
  }

  if (step === "cas_upload") {
    return <p>Solo CAS Upload — built in Task 9.</p>;
  }

  if (step === "family_cas_upload" || step === "upload_my_cas" || step === "parse_queue") {
    return <p>Family CAS Upload — built in Task 10.</p>;
  }

  return null;
}

export { isSkipped };
