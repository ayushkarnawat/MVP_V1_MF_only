import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  AnalyticsExportPayload,
  AnalyticsRetryResponse,
  AnalyticsScopeResponse,
  FundScoreRow,
} from "./types";

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await cachedFetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorPayload = await parseErrorDetail(res);
    throw new ApiError(res.status, errorPayload);
  }

  return res;
}

/* Consolidated precompute contract -- one snapshot per scope ("combined" or a
 * household member id). The backend dispatches its own recompute on a cold-start
 * GET; callers must poll (see useAnalyticsScope.ts), not treat this as one-shot. */
export async function getAnalyticsScope(scope: string, signal?: AbortSignal): Promise<AnalyticsScopeResponse> {
  const res = await authFetch(`/analytics/${scope}`, { signal });
  return res.json();
}

export async function retryAnalyticsScope(scope: string): Promise<AnalyticsRetryResponse> {
  const res = await authFetch(`/analytics/${scope}/retry`, { method: "POST" });
  return res.json();
}

/* Scorer (FR-5/FR-6/FR-7) -- single-fund lookup for the S20 detail modal; not part
 * of the scope snapshot above, fetched on demand when a fund row is clicked. */
export async function getFundScore(schemeId: string): Promise<FundScoreRow> {
  const res = await authFetch(`/analytics/funds/${schemeId}/score`);
  return res.json();
}

/* PDF Export (FR-12) */
export async function postExportPdf(request: {
  scope: "aggregate" | "member";
  memberId: string | null;
  payload: AnalyticsExportPayload;
}): Promise<Blob> {
  const res = await authFetch(`/analytics/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: request.scope, member_id: request.memberId, payload: request.payload }),
  });
  return res.blob();
}

// Deliberately NOT authFetch: the headless print route has no session bearer
// token available to it -- this endpoint is gated by possession of the opaque,
// single-use `token` itself (see the backend design spec's "Auth" section).
export async function getExportPayload(token: string): Promise<AnalyticsExportPayload> {
  const res = await fetch(`${API_BASE_URL}/analytics/export/payload/${token}`);
  if (!res.ok) {
    const errorPayload = await parseErrorDetail(res);
    throw new ApiError(res.status, errorPayload);
  }
  return res.json();
}
