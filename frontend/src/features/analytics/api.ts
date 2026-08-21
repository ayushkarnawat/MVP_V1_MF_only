import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
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
  FundScoreRow,
  PortfolioScoreSummary,
  AggregatePortfolioScoreResponse,
  PortfolioBenchmarkSummary,
  AggregatePortfolioBenchmarkResponse,
  FundVsBenchmarkSummary,
  AggregateFundVsBenchmarkResponse,
  AnalyticsExportPayload,
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

/* Allocation (FR-1/FR-2) */
export async function getMemberAllocation(
  memberId: string,
  signal?: AbortSignal,
): Promise<AnalyticsAllocationSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/allocation`, { signal });
  return res.json();
}

export async function getAggregateAllocation(signal?: AbortSignal): Promise<AggregateAnalyticsAllocationResponse> {
  const res = await authFetch(`/analytics/household/aggregate/allocation`, { signal });
  return res.json();
}

/* Cost / TER (FR-10/FR-11) */
export async function getMemberTer(memberId: string, signal?: AbortSignal): Promise<WeightedTerSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/ter`, { signal });
  return res.json();
}

export async function getAggregateTer(signal?: AbortSignal): Promise<AggregateWeightedTerResponse> {
  const res = await authFetch(`/analytics/household/aggregate/ter`, { signal });
  return res.json();
}

export async function getMemberDirectRegularTer(
  memberId: string,
  signal?: AbortSignal,
): Promise<DirectRegularTerComparison> {
  const res = await authFetch(`/analytics/household-members/${memberId}/ter/direct-regular`, { signal });
  return res.json();
}

export async function getAggregateDirectRegularTer(signal?: AbortSignal): Promise<AggregateDirectRegularTerResponse> {
  const res = await authFetch(`/analytics/household/aggregate/ter/direct-regular`, { signal });
  return res.json();
}

/* Category Ranking (FR-3/FR-4) */
export async function getMemberCategoryRanking(
  memberId: string,
  signal?: AbortSignal,
): Promise<CategoryRankingSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/category-ranking`, { signal });
  return res.json();
}

export async function getAggregateCategoryRanking(signal?: AbortSignal): Promise<AggregateCategoryRankingResponse> {
  const res = await authFetch(`/analytics/household/aggregate/category-ranking`, { signal });
  return res.json();
}

/* Scorer (FR-5/FR-6/FR-7) */
export async function getFundScore(schemeId: string): Promise<FundScoreRow> {
  const res = await authFetch(`/analytics/funds/${schemeId}/score`);
  return res.json();
}

export async function getMemberScore(memberId: string, signal?: AbortSignal): Promise<PortfolioScoreSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/score`, { signal });
  return res.json();
}

export async function getAggregateScore(signal?: AbortSignal): Promise<AggregatePortfolioScoreResponse> {
  const res = await authFetch(`/analytics/household/aggregate/score`, { signal });
  return res.json();
}

/* Benchmark Comparison (FR-8/FR-9) */
export async function getMemberBenchmark(
  memberId: string,
  signal?: AbortSignal,
): Promise<PortfolioBenchmarkSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/benchmark`, { signal });
  return res.json();
}

export async function getAggregateBenchmark(signal?: AbortSignal): Promise<AggregatePortfolioBenchmarkResponse> {
  const res = await authFetch(`/analytics/household/aggregate/benchmark`, { signal });
  return res.json();
}

export async function getMemberFundBenchmark(
  memberId: string,
  signal?: AbortSignal,
): Promise<FundVsBenchmarkSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/benchmark/funds`, { signal });
  return res.json();
}

export async function getAggregateFundBenchmark(signal?: AbortSignal): Promise<AggregateFundVsBenchmarkResponse> {
  const res = await authFetch(`/analytics/household/aggregate/benchmark/funds`, { signal });
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
// token available to it — this endpoint is gated by possession of the opaque,
// single-use `token` itself (see the backend design spec's "Auth" section).
export async function getExportPayload(token: string): Promise<AnalyticsExportPayload> {
  const res = await fetch(`${API_BASE_URL}/analytics/export/payload/${token}`);
  if (!res.ok) {
    const errorPayload = await parseErrorDetail(res);
    throw new ApiError(res.status, errorPayload);
  }
  return res.json();
}
