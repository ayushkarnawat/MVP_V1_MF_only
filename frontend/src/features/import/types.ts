export interface SchemeMatchPreview {
  temp_id: string;
  name: string;
  isin: string | null;
  amfi_code: string | null;
  suggested_amfi_code: string | null;
  suggested_name: string | null;
  match_confidence: number;
  match_status: string;
  folio: string;
  amc: string;
  transaction_count: number;
  plan_type: string;
  category: string | null;
  person_key?: string | null;
  fund_logo_url?: string | null;
  amc_logo_url?: string | null;
  logo_url?: string | null;
}

export interface TransactionPreview {
  folio: string;
  scheme_name: string;
  txn_date: string;
  txn_type: string;
  description: string | null;
  amount: string | null;
  units: string | null;
  nav: string | null;
}

export interface PersonPreview {
  person_key: string;
  name: string;
  name_source: string;
  needs_name: boolean;
  /** null renders as "(PAN not on statement)". */
  pan_masked: string | null;
  is_me: boolean;
  status: string;
  member_id: string | null;
  fund_count: number;
  unresolved_count: number;
  matched_by_name_temp_ids: string[];
}

export interface NameNotice {
  person_key: string;
  member_id: string | null;
  current_name: string;
  statement_name: string;
  kind: "update" | "ask";
  first_upload: boolean;
}

export interface SamePersonPrompt {
  person_key: string;
  member_id: string;
  member_name: string;
  entered_pan_masked: string;
  statement_pan_masked: string;
  /** Staging-QA 5B: "name_only" = a PAN-less member this statement's person may be. */
  kind?: "typed_pan" | "name_only";
  member_fund_count?: number;
  statement_name?: string;
}

export interface ImportPreviewResponse {
  session_id: string;
  filename: string;
  investor_name: string | null;
  investor_email: string | null;
  pan_masked: string | null;
  schemes: SchemeMatchPreview[];
  transactions: TransactionPreview[];
  transaction_count: number;
  parse_warnings: string[];
  cas_type: string;
  file_type: string;
  people: PersonPreview[];
  unassigned_temp_ids: string[];
  name_notices: NameNotice[];
  same_person_prompts: SamePersonPrompt[];
  expires_at: string;
}

export interface SchemeConfirmation {
  temp_id: string;
  amfi_code?: string;
  plan_type_override?: "direct" | "regular" | "unclassified";
}

/** One person's choices from the people popup and their ribbon. */
export interface PersonConfirmation {
  person_key: string;
  name?: string;
  /** false = "Leave it" (only for a person on another account). */
  include?: boolean;
  scheme_confirmations: SchemeConfirmation[];
  /** Answers a name notice of kind "ask"; omitted keeps the stored name. */
  accept_name_update?: boolean;
}

export interface PersonConfirmResult {
  person_key: string;
  member_id: string;
  name: string;
  import_id: string;
  added: number;
  skipped: number;
}

export interface ImportConfirmResponse {
  added: number;
  skipped: number;
  import_id: string;
  warnings: string[];
  people: PersonConfirmResult[];
  upload_group_id: string | null;
}

/** Every 409 an upload-time call can raise, plus the 410 session_expired. */
export type ImportPromptCode =
  | "member_pan_mismatch"
  | "member_not_in_file"
  | "cross_account_pan_blocked"
  | "statement_pan_on_other_account"
  | "self_name_mismatch"
  | "which_is_self"
  // Legacy PanConflictError codes the backend can still raise.
  | "pan_belongs_to_other_member"
  | "pan_mismatch_for_member"
  | "session_expired";

/** Prompts the user can acknowledge via POST .../acknowledge. */
export type AcknowledgeCode = "member_not_in_file" | "cross_account_pan_blocked";

export interface ImportPrompt {
  code: ImportPromptCode;
  message: string;
  /** null when the prompt ended the review (session_expired). */
  sessionId: string | null;
  details: Record<string, unknown>;
}

export interface ParseErrorPayload {
  code: string;
  message: string;
}

export type ImportLifecycleStatus =
  | "not_started"
  | "requesting_cas"
  | "waiting_for_user"
  | "upload_started"
  | "password_required"
  | "validation_failed"
  | "processing"
  | "retry_pending"
  | "import_successful"
  | "import_failed"
  | "expired";

export interface CASImportStatusResponse {
  import_id: string;
  household_member_id: string;
  status: ImportLifecycleStatus;
  error_code: string | null;
  error_message: string | null;
  new_transactions_count: number | null;
  duplicate_transactions_count: number | null;
  statement_from_date: string | null;
  statement_to_date: string | null;
  source_cas_type: string | null;
  uploaded_at: string;
  confirmed_at: string | null;
  parse_warnings?: string[];
}

export interface HouseholdImportHistoryItem {
  import_id: string;
  household_member_id: string;
  uploaded_at: string;
  statement_from_date: string | null;
  statement_to_date: string | null;
  status: string;
  new_transactions_count: number | null;
  /** The list is flat; the UI groups rows by upload_group_id. */
  upload_group_id: string | null;
  member_name: string;
  group_people_count: number;
}

export interface DeleteImportResponse {
  deleted_transactions_count: number;
  removed_member_ids: string[];
  deleted_file: boolean;
}

export interface CoverageGapItem {
  folio_id: string;
  folio_number: string;
  scheme_id: string;
  scheme_name: string;
  deficit_units: string;
  first_deficit_date: string;
}

export interface OpeningBalancePayload {
  units: string;
  date: string;
  amount?: string;
  nav?: string;
}

export interface OpeningBalanceResponse {
  transaction_id: string;
  folio_id: string;
  type: string;
  date: string;
  units: string;
  amount: string;
  nav: string;
  has_coverage_gap: boolean;
}
