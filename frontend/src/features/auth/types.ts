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
  primary_goals: PrimaryGoal[] | null;
  // The self member's name (null before the name step is submitted); lets a
  // resumed onboarding session pre-fill and skip the name step.
  self_name: string | null;
  // Legal document types whose accepted version is behind the current one (the
  // re-consent gate shows while non-empty).
  consent_outdated: string[];
  pending_deletion?: boolean;
  deletion_scheduled_at?: string | null;
}

export type AccountDeletionReason =
  | "not_using_enough"
  | "missing_feature"
  | "found_alternative"
  | "data_or_trust_concern"
  | "other";

export type ContactChangeChannel = "email" | "phone";

export interface UpdateMeBody {
  onboarding_step?: string;
  investor_type?: InvestorType;
  primary_goals?: PrimaryGoal[];
  onboarding_completed?: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  // null while a CAS-detected member is locked (details not added yet).
  relationship: Relationship | null;
  relationship_other_label: string | null;
  origin: string;
  // Set while the member is locked; the unlock popup collects the details.
  lock_reason: string | null;
  details_required: boolean;
  // First two + last two characters of the PAN, never the raw value.
  pan_masked: string | null;
  phone_number: string | null;
  email: string | null;
  // True only for a locked member whose statement carried a PAN (then the PAN is read-only).
  pan_on_statement: boolean;
  name_from_statement: boolean;
}

/** Unlock-only: name never travels; `pan` only when the statement had none. */
export interface MemberDetailsBody {
  relationship: Exclude<Relationship, "self">;
  relationship_other_label?: string | null;
  pan?: string;
}

export interface MemberUpdateBody {
  relationship?: Exclude<Relationship, "self">;
  relationship_other_label?: string | null;
  phone_number?: string | null;
  email?: string | null;
}

export interface MergeMemberResult {
  folios_moved: number;
  transactions_dropped: number;
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

export interface EmailRequiredDetail {
  token: string;
  prefill_phone: string | null;
}

export interface EmailRequiredResponse {
  email_required: EmailRequiredDetail;
}

export interface EmailOtpRequiredDetail {
  token: string;
  prefill_email: string;
  otp: string | null; // only populated in dev-stub delivery mode
}

export interface EmailOtpRequiredResponse {
  email_otp_required: EmailOtpRequiredDetail;
}

export type OtpVerifyResult = OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse | EmailRequiredResponse;

export type EmailOtpVerifyResult = OtpVerifyResponse | PhoneRequiredResponse;

export function isLinkRequired(result: OtpVerifyResult): result is LinkRequiredResponse {
  return "link_required" in result;
}

export function isPhoneRequired(result: OtpVerifyResult): result is PhoneRequiredResponse {
  return "phone_required" in result;
}

export function isEmailRequired(result: OtpVerifyResult): result is EmailRequiredResponse {
  return "email_required" in result;
}
