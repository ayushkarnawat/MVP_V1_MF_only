import { API_BASE_URL, ApiError, invalidateApiCache, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  CASImportStatusResponse,
  CoverageGapItem,
  ImportConfirmResponse,
  ImportPreviewResponse,
  OpeningBalancePayload,
  OpeningBalanceResponse,
  ParseErrorPayload,
  SchemeConfirmation,
} from "./types";

export { ApiError };

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function parseImport(file: File, password: string): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("password", password);

  const response = await fetch(`${API_BASE_URL}/imports/parse`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as ImportPreviewResponse;
}

export async function confirmImport(
  sessionId: string,
  householdMemberId: string,
  schemeConfirmations: SchemeConfirmation[],
): Promise<ImportConfirmResponse> {
  const response = await fetch(`${API_BASE_URL}/imports/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      session_id: sessionId,
      household_member_id: householdMemberId,
      scheme_confirmations: schemeConfirmations,
    }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  // Confirming an import changes holdings/allocation/analytics data —
  // clear the GET cache so the dashboard/analytics views the user is
  // returned to don't serve a pre-import snapshot for the rest of the
  // cache TTL window.
  invalidateApiCache();
  return (await response.json()) as ImportConfirmResponse;
}

export async function uploadCasImport(
  file: File,
  password: string,
  householdMemberId: string,
  sourceTab: string = "upload",
): Promise<CASImportStatusResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("password", password);
  formData.append("household_member_id", householdMemberId);
  formData.append("source_tab", sourceTab);

  const response = await fetch(`${API_BASE_URL}/cas-imports`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CASImportStatusResponse;
}

export async function getCasImportStatus(importId: string): Promise<CASImportStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/cas-imports/${importId}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CASImportStatusResponse;
}

export async function retryCasImportPassword(
  importId: string,
  password: string,
): Promise<CASImportStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/cas-imports/${importId}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CASImportStatusResponse;
}

export async function getMemberImportHistory(memberId: string): Promise<CASImportStatusResponse[]> {
  const response = await fetch(`${API_BASE_URL}/household-members/${memberId}/cas-imports`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CASImportStatusResponse[];
}

export async function getMemberCoverageGaps(
  memberId: string,
  signal?: AbortSignal,
): Promise<CoverageGapItem[]> {
  const response = await fetch(`${API_BASE_URL}/household-members/${memberId}/coverage-gaps`, {
    method: "GET",
    headers: authHeaders(),
    signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CoverageGapItem[];
}

export async function postOpeningBalance(
  folioId: string,
  payload: OpeningBalancePayload,
): Promise<OpeningBalanceResponse> {
  const response = await fetch(`${API_BASE_URL}/folios/${folioId}/opening-balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  // Resolving an opening balance changes holdings/allocation data for the
  // affected folio — same reasoning as confirmImport above.
  invalidateApiCache();
  return (await response.json()) as OpeningBalanceResponse;
}

export async function requestCamsStatement(
  householdMemberId: string,
): Promise<{
  import_id: string;
  household_member_id: string;
  status: string;
  cams_url: string;
  expires_at: string;
}> {
  const response = await fetch(`${API_BASE_URL}/cas-imports/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ household_member_id: householdMemberId }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as {
    import_id: string;
    household_member_id: string;
    status: string;
    cams_url: string;
    expires_at: string;
  };
}

export async function cancelImportRequest(
  importId: string,
): Promise<CASImportStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/cas-imports/${importId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }

  return (await response.json()) as CASImportStatusResponse;
}


