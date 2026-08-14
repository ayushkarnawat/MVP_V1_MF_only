import { API_BASE_URL, ApiError, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  AnalyticsAllocationSummary,
  AggregateAnalyticsAllocationResponse,
  WeightedTerSummary,
  AggregateWeightedTerResponse,
  DirectRegularTerComparison,
  AggregateDirectRegularTerResponse,
  CategoryRankingSummary,
  AggregateCategoryRankingResponse,
} from "./types";

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorPayload = await parseErrorDetail(res);
    throw new ApiError(res.status, errorPayload);
  }

  return res;
}

/* Allocation (FR-1/FR-2) */
export async function getMemberAllocation(
  memberId: string
): Promise<AnalyticsAllocationSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/allocation`);
  return res.json();
}

export async function getAggregateAllocation(): Promise<AggregateAnalyticsAllocationResponse> {
  const res = await authFetch(`/analytics/household/aggregate/allocation`);
  return res.json();
}

/* Cost / TER (FR-10/FR-11) */
export async function getMemberTer(memberId: string): Promise<WeightedTerSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/ter`);
  return res.json();
}

export async function getAggregateTer(): Promise<AggregateWeightedTerResponse> {
  const res = await authFetch(`/analytics/household/aggregate/ter`);
  return res.json();
}

export async function getMemberDirectRegularTer(
  memberId: string
): Promise<DirectRegularTerComparison> {
  const res = await authFetch(`/analytics/household-members/${memberId}/ter/direct-regular`);
  return res.json();
}

export async function getAggregateDirectRegularTer(): Promise<AggregateDirectRegularTerResponse> {
  const res = await authFetch(`/analytics/household/aggregate/ter/direct-regular`);
  return res.json();
}

/* Category Ranking (FR-3/FR-4) */
export async function getMemberCategoryRanking(
  memberId: string
): Promise<CategoryRankingSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/category-ranking`);
  return res.json();
}

export async function getAggregateCategoryRanking(): Promise<AggregateCategoryRankingResponse> {
  const res = await authFetch(`/analytics/household/aggregate/category-ranking`);
  return res.json();
}
