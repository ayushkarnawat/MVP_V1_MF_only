import { API_BASE_URL, ApiError, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type { AcceptedDocument, LegalDocument, LegalDocumentType } from "./types";

// Cached for the page session: the documents only change on a deploy, and a
// stale-version 422 at sign-up calls getLegalDocuments(true) to refresh.
let cached: Promise<LegalDocument[]> | null = null;

export async function getLegalDocuments(force = false): Promise<LegalDocument[]> {
  if (force) cached = null;
  if (!cached) {
    const request = (async () => {
      const response = await fetch(`${API_BASE_URL}/legal/documents`);
      if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
      return (await response.json()) as LegalDocument[];
    })();
    // A failed load must not be cached, or Retry could never succeed.
    request.catch(() => {
      if (cached === request) cached = null;
    });
    cached = request;
  }
  return cached;
}

export async function submitReconsent(accepted: AcceptedDocument[]): Promise<{ consent_outdated: string[] }> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/legal/consents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ accepted_documents: accepted }),
  });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return (await response.json()) as { consent_outdated: string[] };
}

export function acceptedFor(docs: LegalDocument[], types: LegalDocumentType[]): AcceptedDocument[] {
  return types.flatMap((type) => {
    const doc = docs.find((d) => d.document_type === type);
    return doc ? [{ document_type: doc.document_type, document_version: doc.version }] : [];
  });
}

export function isConsentRequired(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 422 &&
    typeof err.payload === "object" &&
    err.payload !== null &&
    (err.payload as { code?: unknown }).code === "consent_required"
  );
}

export interface MyConsent {
  document_type: LegalDocumentType;
  document_version: string;
  recorded_at: string;
}

/** The latest agreement per document, for the Profile "Terms of Service" section. */
export async function getMyConsents(): Promise<MyConsent[]> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/legal/consents/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return (await response.json()) as MyConsent[];
}
