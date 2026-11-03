import type { AuthVariant } from "./redesign/variant";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { currentStep, goBack, goNext, initHistory, isSkipped, markAnswered, skipToNext } from "./onboardingHistory";
import type { HistoryState } from "./onboardingHistory";
import { isOnboardingStep } from "./onboardingSteps";
import type { OnboardingStep } from "./onboardingSteps";
import { Q1Name } from "./Q1Name";
import { Q2Investing } from "./Q2Investing";
import { ALL_GOALS, Q3Purpose } from "./Q3Purpose";
import { OnboardingCardStack } from "./OnboardingCardStack";
import { SoloCasUpload } from "./SoloCasUpload";
import { createHouseholdMember, listHouseholdMembers } from "./api";
import { AccountDetails } from "./redesign/AccountDetails";
import { AuthPage } from "./redesign/AuthPage";
import { clearPendingSignup, readPendingSignup } from "./redesign/pendingSignup";
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
    // Only the six current codes count: someone who stored an old code is asked once more (decision QF).
    if (!me.primary_goals || !me.primary_goals.some(g => ALL_GOALS.includes(g))) return "q3_purpose";
    return "cas_upload";
  }
  if (!isOnboardingStep(step) || step === "done") return "q1_name";
  const pastName = step === "q2_investing" || step === "q3_purpose" || step === "cas_upload";
  if (pastName && !me?.self_name) return "q1_name";
  return step;
}

interface OnboardingFlowProps {
  isMobile?: boolean;
  /** See AuthEntryFlow: "legacy" by default. */
  variant?: AuthVariant;
}

export function OnboardingFlow({ isMobile = false, variant = "legacy" }: OnboardingFlowProps) {
  const { me, updateMe } = useAuth();
  const split = variant === "split" && !isMobile;
  const [history, setHistory] = useState<HistoryState>(() => initHistory(resumeStep(me)));
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    name: me?.self_name ?? "",
    investorType: me?.investor_type ?? null,
    primaryGoals: (me?.primary_goals ?? []).filter(g => ALL_GOALS.includes(g)),
  }));

  const step = currentStep(history);

  // Split sign-up: the name typed on screen 3 was kept in sessionStorage because the account did not exist yet. Now
  // it does, so the self member is created from it (list first, so a reload never makes a second one) and the flow
  // moves on. A stored name for another phone number is dropped. If saving fails, or nothing is stored (a refresh),
  // the name screen is shown with the verified email read-only.
  const [handover, setHandover] = useState<"checking" | "saving" | "idle">(() => {
    if (!split || step !== "q1_name") return "idle";
    const pending = readPendingSignup();
    return pending && pending.phone === me?.phone_number ? "saving" : "checking";
  });
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const handoverStarted = useRef(false);
  useEffect(() => {
    if (handover === "checking") {
      const pending = readPendingSignup();
      if (pending && pending.phone !== me?.phone_number) clearPendingSignup();
      setHandover("idle");
      return;
    }
    if (handover !== "saving" || handoverStarted.current) return;
    handoverStarted.current = true;
    const pending = readPendingSignup();
    if (!pending) {
      setHandover("idle");
      return;
    }
    void (async () => {
      try {
        const members = await listHouseholdMembers();
        if (!members.some((member) => member.relationship === "self")) {
          await createHouseholdMember(pending.name, "self");
        }
        clearPendingSignup();
        setAnswers((a) => ({ ...a, name: pending.name }));
        setHistory((h) => goNext(markAnswered(h), "q2_investing"));
        setHandover("idle");
      } catch {
        setAnswers((a) => ({ ...a, name: pending.name }));
        setHandoverError("Couldn't save your name. Try again.");
        setHandover("idle");
      }
    })();
  }, [handover, me?.phone_number]);

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
    clearPendingSignup();
    setAnswers((a) => ({ ...a, name }));
    advance("q2_investing");
  };

  const renderStep = () => {
    if (step === "q1_name" && split) {
      if (handover !== "idle") {
        return (
          <AuthPage>
            <p role="status" className="text-sm text-[var(--ui-text-muted)]">Setting up your profile...</p>
          </AuthPage>
        );
      }
      return (
        <AccountDetails
          initialName={answers.name}
          initialEmail={me?.email ?? ""}
          emailLocked
          error={handoverError}
          onSubmit={({ name }) => submitName(name)}
        />
      );
    }

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
