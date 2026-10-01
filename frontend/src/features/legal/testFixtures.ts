import type { LegalDocument } from "./types";

export const DOCS: LegalDocument[] = [
  { document_type: "terms_of_service", version: "tos-placeholder-2026-10-01", title: "Terms & Conditions", sha256: "a", content: "# Terms & Conditions\n\n> Placeholder, being finalised.\n\nFirst paragraph.\n\nSecond paragraph.", purposes: [] },
  { document_type: "privacy_policy", version: "privacy-placeholder-2026-10-01", title: "Privacy Policy", sha256: "b", content: "Privacy body.", purposes: [] },
  { document_type: "pan_disclaimer", version: "pan-disclaimer-placeholder-2026-10-01", title: "PAN Disclaimer", sha256: "c", content: "# PAN disclaimer\n\n> This document is being finalised.\n\nI confirm I am authorised to share this statement.", purposes: [] },
];
