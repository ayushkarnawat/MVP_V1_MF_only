export const ONBOARDING_STEPS = [
  "landing",
  "phone",
  "otp",
  "trust_primer",
  "q1_name",
  "q2_investing",
  "q3_purpose",
  "q4_household",
  "add_family",
  "cas_upload",
  "family_cas_upload",
  "upload_my_cas",
  "parse_queue",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string | null | undefined): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value ?? "");
}
