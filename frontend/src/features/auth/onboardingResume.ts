import type { OnboardingStep } from "./onboardingSteps";
import { ALL_GOALS } from "./Q3Purpose";
import type { MeResponse } from "./types";

// Where the split (desktop sign-up) flow resumes. Today's resumeStep keeps serving the mobile and legacy flows.
// Screen 3 is q1_name, screen 4 is q2_investing (q3_purpose is the old second half of it), screen 5 is
// connect_accounts and screen 6 is all_set. Screens 5 and 6 are never saved as the step: a saved cas_upload
// means "the import was started", and all_set is told apart by a completed import (one read at resume).
export function resumeStepSplit(me: MeResponse | null | undefined, hasCompletedImport: boolean): OnboardingStep {
  const step = me?.onboarding_step;
  if (!me?.self_name) return "q1_name";
  if (step === "trust_primer") {
    if (!me.investor_type) return "q2_investing";
    if (!me.primary_goals || !me.primary_goals.some((goal) => ALL_GOALS.includes(goal))) return "q2_investing";
    return "connect_accounts";
  }
  if (step === "q2_investing" || step === "q3_purpose") return "q2_investing";
  if (step === "cas_upload") return hasCompletedImport ? "all_set" : "connect_accounts";
  // q1_name, a missing or unknown step and "done" all land on screen 3, which shows the name and the email.
  return "q1_name";
}
