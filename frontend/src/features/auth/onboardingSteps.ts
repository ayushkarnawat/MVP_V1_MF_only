export const ONBOARDING_STEPS = [
  "landing",
  "phone",
  "otp",
  "trust_primer",
  "q1_name",
  "q2_investing",
  "q3_purpose",
  "cas_upload",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string | null | undefined): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value ?? "");
}

export function getStepIndex(step: OnboardingStep): number {
  switch (step) {
    case "q1_name":
      return 0;
    case "q2_investing":
      return 1;
    case "q3_purpose":
      return 2;
    case "trust_primer":
      return 3;
    case "cas_upload":
      return 4;
    default:
      return 0;
  }
}
