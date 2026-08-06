import { API_BASE_URL, ApiError, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  ImportConfirmResponse,
  ImportPreviewResponse,
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

  return (await response.json()) as ImportConfirmResponse;
}
