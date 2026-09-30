import { API_BASE_URL, ApiError, invalidateApiCache, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  AcknowledgeCode,
  CASImportStatusResponse,
  CoverageGapItem,
  ImportConfirmResponse,
  ImportPreviewResponse,
  OpeningBalancePayload,
  OpeningBalanceResponse,
  ParseErrorPayload,
  PersonConfirmation,
  SchemeConfirmation,
  HouseholdImportHistoryItem,
  DeleteImportResponse,
} from "./types";

export { ApiError };

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function parseImport(
  file: File,
  password: string,
  householdMemberId: string,
): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("password", password);
  // The backend checks and claims the CAS's PAN for this member at upload.
  formData.append("household_member_id", householdMemberId);

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

async function postSession(
  sessionId: string,
  action: string,
  body: Record<string, unknown>,
): Promise<ImportPreviewResponse> {
  const response = await fetch(`${API_BASE_URL}/imports/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }
  return (await response.json()) as ImportPreviewResponse;
}

/** U2: the user's typed name for the person on the statement. */
export function resolveName(sessionId: string, name: string): Promise<ImportPreviewResponse> {
  return postSession(sessionId, "resolve-name", { name });
}

/** U3: pick which statement person is Me; null = "None of these". */
export function resolveSelf(sessionId: string, personKey: string | null): Promise<ImportPreviewResponse> {
  return postSession(sessionId, "resolve-self", { person_key: personKey });
}

/** U4/U13: use the statement's PAN for the member. */
export function resolvePan(sessionId: string): Promise<ImportPreviewResponse> {
  return postSession(sessionId, "resolve-pan", { choice: "statement" });
}

export function resolveSamePerson(
  sessionId: string,
  personKey: string,
  memberId: string,
  same: boolean,
): Promise<ImportPreviewResponse> {
  return postSession(sessionId, "resolve-same-person", { person_key: personKey, member_id: memberId, same });
}

export function acknowledgePrompt(sessionId: string, code: AcknowledgeCode): Promise<ImportPreviewResponse> {
  return postSession(sessionId, "acknowledge", { code });
}

/** Confirms the review with per-person choices. `movedFunds` is temp_id -> person_key
 * (top-level, matching the backend body). A repeat call gets 410 session_expired. */
export async function confirmPeopleImport(
  sessionId: string,
  people: PersonConfirmation[],
  movedFunds: Record<string, string> = {},
): Promise<ImportConfirmResponse> {
  const response = await fetch(`${API_BASE_URL}/imports/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, people, moved_funds: movedFunds }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
  }
  invalidateApiCache();
  return (await response.json()) as ImportConfirmResponse;
}

/** Best effort: releases a parsed-but-abandoned session's pending PAN. If
 * this never reaches the server, the pending PAN expires on its own. */
export async function discardImportSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/imports/sessions/${encodeURIComponent(sessionId)}/discard`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    // Intentionally ignored -- see doc comment.
  }
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

export async function getHouseholdImportHistory(): Promise<HouseholdImportHistoryItem[]> {
  const response = await fetch(`${API_BASE_URL}/imports/history`, { headers: authHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  return (await response.json()) as HouseholdImportHistoryItem[];
}

export async function deleteHouseholdImport(
  importId: string,
  scope: "person" | "group" = "person",
): Promise<DeleteImportResponse> {
  const response = await fetch(`${API_BASE_URL}/imports/${importId}?scope=${scope}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  invalidateApiCache();
  return (await response.json()) as DeleteImportResponse;
}

/** Deletes all of a member's funds; removeMember also removes the member row. */
export async function deleteMemberPortfolio(
  memberId: string,
  removeMember: boolean,
): Promise<DeleteImportResponse> {
  const response = await fetch(
    `${API_BASE_URL}/household-members/${memberId}/portfolio?remove_member=${removeMember}`,
    { method: "DELETE", headers: authHeaders() },
  );
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
  invalidateApiCache();
  return (await response.json()) as DeleteImportResponse;
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
