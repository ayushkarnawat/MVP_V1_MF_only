import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "@/lib/apiClient";
import type { SearchIndexResponse } from "./searchTypes";

export async function fetchSearchIndex(
  token: string | null,
  signal?: AbortSignal,
): Promise<SearchIndexResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await cachedFetch(`${API_BASE_URL}/household/search-index`, {
    method: "GET",
    cache: "no-store",
    headers,
    signal,
  });

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as SearchIndexResponse;
}
