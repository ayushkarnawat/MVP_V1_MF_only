import { createContext, useContext } from "react";

export type MobileJourneyStep =
  | "auth_landing"
  | "auth_email"
  | "auth_phone"
  | "auth_otp"
  | "auth_email_otp"
  | "auth_link_account"
  | "onboarding_q1_name"
  | "onboarding_q2_investing"
  | "onboarding_q3_purpose"
  | "onboarding_trust_primer"
  | "onboarding_q4_household"
  | "onboarding_add_family"
  | "onboarding_cas_upload"
  | "onboarding_family_cas_upload";

export interface CameraCoordinates {
  x: number;
  y: number;
  scale: number;
  rotate: number;
}

export type AuthStage = "email" | "phone" | "otp" | "complete" | "landing" | "identity" | "verify";

export interface AuthStageInfo {
  stage: AuthStage;
  stepIndex: number; // 0 (Milestone 1), 1 (Milestone 2), 2 (Milestone 3), 3 (Milestone 4)
  progress: number;  // 0.12 -> 0.40 -> 0.72 -> 1.0
  label: string;
}

/**
 * Maps auth steps to their corresponding 4 chronological milestones:
 * Milestone 1 (Screen 1) -> Milestone 2 (Screen 2) -> Milestone 3 (Screen 3) -> Milestone 4 (Screen 4)
 */
export function getAuthStage(
  step: MobileJourneyStep | string = "auth_landing",
  explicitStepIndex?: number
): AuthStageInfo {
  const milestoneProgress = [0.10, 0.38, 0.68, 0.95];
  const stageNames: AuthStage[] = ["email", "phone", "otp", "complete"];
  const stageLabels = ["Email", "Phone", "OTP", "Complete"];

  if (typeof explicitStepIndex === "number" && explicitStepIndex >= 0 && explicitStepIndex <= 3) {
    return {
      stage: stageNames[explicitStepIndex] ?? "email",
      stepIndex: explicitStepIndex,
      progress: milestoneProgress[explicitStepIndex] ?? 0.10,
      label: stageLabels[explicitStepIndex] ?? "Email",
    };
  }

  switch (step) {
    case "auth_landing":
    case "landing":
      return { stage: "email", stepIndex: 0, progress: 0.10, label: "Email" };

    case "auth_email":
    case "email":
      return { stage: "phone", stepIndex: 1, progress: 0.38, label: "Phone" };

    case "auth_phone":
    case "phone":
      return { stage: "phone", stepIndex: 1, progress: 0.38, label: "Phone" };

    case "auth_email_otp":
    case "email_otp":
      return { stage: "phone", stepIndex: 1, progress: 0.38, label: "Phone" };

    case "auth_otp":
    case "otp":
      return { stage: "otp", stepIndex: 2, progress: 0.68, label: "OTP" };

    case "auth_link_account":
    case "link_account":
    case "auth_complete":
      return { stage: "complete", stepIndex: 3, progress: 0.95, label: "Complete" };

    default:
      if (typeof step === "string" && step.startsWith("auth_")) {
        return { stage: "complete", stepIndex: 3, progress: 0.95, label: "Complete" };
      }
      return { stage: "email", stepIndex: 0, progress: 0.10, label: "Email" };
  }
}

/**
 * Coordinate matrix for auth steps
 */
export const JOURNEY_COORDINATES: Record<MobileJourneyStep, CameraCoordinates> = {
  auth_landing: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  auth_email: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  auth_phone: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  auth_otp: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  auth_email_otp: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  auth_link_account: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_q1_name: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_q2_investing: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_q3_purpose: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_trust_primer: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_q4_household: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_add_family: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_cas_upload: { x: 0, y: 0, scale: 1.0, rotate: 0 },
  onboarding_family_cas_upload: { x: 0, y: 0, scale: 1.0, rotate: 0 },
};

export interface MobileJourneyContextValue {
  activeStep: MobileJourneyStep;
  stepIndex?: number;
  setJourneyStep: (step: MobileJourneyStep, stepIndex?: number) => void;
}

export const MobileJourneyContext = createContext<MobileJourneyContextValue | null>(null);

export function useMobileJourney() {
  return useContext(MobileJourneyContext);
}
