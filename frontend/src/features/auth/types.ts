export type InvestorType = "self_directed" | "advisor_assisted" | "mixed" | "beginner";
export type PrimaryGoal =
  | "consolidated_view"
  | "understand_holdings"
  | "family_management"
  | "performance_comparison";
export type Relationship = "self" | "spouse" | "parent" | "child" | "sibling" | "other";

export interface OtpRequestResponse {
  message: string;
  otp: string | null;
}

export interface OtpVerifyResponse {
  session_token: string;
  user_id: string;
  onboarding_step: string | null;
  onboarding_completed: boolean;
}

export interface MeResponse {
  user_id: string;
  phone_number: string;
  email: string | null;
  onboarding_step: string | null;
  onboarding_completed: boolean;
  investor_type: InvestorType | null;
  primary_goal: PrimaryGoal | null;
}

export interface UpdateMeBody {
  onboarding_step?: string;
  investor_type?: InvestorType;
  primary_goal?: PrimaryGoal;
  onboarding_completed?: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  relationship: Relationship;
  relationship_other_label: string | null;
}

export type ExistingMethod = "phone" | "email" | "google";

export interface LinkRequiredDetail {
  token: string;
  matched_email: string;
  existing_method: ExistingMethod;
}

export interface LinkRequiredResponse {
  link_required: LinkRequiredDetail;
}

export interface PhoneRequiredDetail {
  token: string;
  prefill_email: string | null;
}

export interface PhoneRequiredResponse {
  phone_required: PhoneRequiredDetail;
}

export type OtpVerifyResult = OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse;

export function isLinkRequired(result: OtpVerifyResult): result is LinkRequiredResponse {
  return "link_required" in result;
}

export function isPhoneRequired(result: OtpVerifyResult): result is PhoneRequiredResponse {
  return "phone_required" in result;
}
