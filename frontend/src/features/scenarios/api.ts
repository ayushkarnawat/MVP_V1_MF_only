import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type { ScenarioResult, ScenarioSummary } from "./types";

async function authFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await cachedFetch(`${API_BASE_URL}${path}`, { headers, signal });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response;
}

export async function listScenarios(curated: boolean, signal?: AbortSignal): Promise<ScenarioSummary[]> {
  const response = await authFetch(curated ? "/scenarios?curated=true" : "/scenarios", signal);
  return response.json();
}

export async function getScenarioResult(scenarioId: string, signal?: AbortSignal): Promise<ScenarioResult> {
  const response = await authFetch(`/scenarios/${encodeURIComponent(scenarioId)}/results`, signal);
  return response.json();
}
