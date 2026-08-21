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
}

export interface SchemeConfirmation {
  temp_id: string;
  amfi_code?: string;
  plan_type_override?: "direct" | "regular" | "unclassified";
}

export interface ImportConfirmResponse {
  added: number;
  skipped: number;
  import_id: string;
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


