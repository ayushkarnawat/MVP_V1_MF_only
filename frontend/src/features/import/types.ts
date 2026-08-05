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
