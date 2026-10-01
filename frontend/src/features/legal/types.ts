export type LegalDocumentType = "terms_of_service" | "privacy_policy" | "pan_disclaimer";

export interface LegalDocument {
  document_type: LegalDocumentType;
  version: string;
  title: string;
  sha256: string;
  content: string;
  purposes: string[];
}

export interface AcceptedDocument {
  document_type: LegalDocumentType;
  document_version: string;
}
