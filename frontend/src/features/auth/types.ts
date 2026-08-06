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
