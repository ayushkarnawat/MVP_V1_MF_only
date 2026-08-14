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
  FundScoreRow,
  PortfolioScoreSummary,
  AggregatePortfolioScoreResponse,
  PortfolioBenchmarkSummary,
  AggregatePortfolioBenchmarkResponse,
  FundVsBenchmarkSummary,
  AggregateFundVsBenchmarkResponse,
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

/* Scorer (FR-5/FR-6/FR-7) */
export async function getFundScore(schemeId: string): Promise<FundScoreRow> {
  const res = await authFetch(`/analytics/funds/${schemeId}/score`);
  return res.json();
}

export async function getMemberScore(memberId: string): Promise<PortfolioScoreSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/score`);
  return res.json();
}

export async function getAggregateScore(): Promise<AggregatePortfolioScoreResponse> {
  const res = await authFetch(`/analytics/household/aggregate/score`);
  return res.json();
}

/* Benchmark Comparison (FR-8/FR-9) */
export async function getMemberBenchmark(
  memberId: string
): Promise<PortfolioBenchmarkSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/benchmark`);
  return res.json();
}

export async function getAggregateBenchmark(): Promise<AggregatePortfolioBenchmarkResponse> {
  const res = await authFetch(`/analytics/household/aggregate/benchmark`);
  return res.json();
}

export async function getMemberFundBenchmark(
  memberId: string
): Promise<FundVsBenchmarkSummary> {
  const res = await authFetch(`/analytics/household-members/${memberId}/benchmark/funds`);
  return res.json();
}

export async function getAggregateFundBenchmark(): Promise<AggregateFundVsBenchmarkResponse> {
  const res = await authFetch(`/analytics/household/aggregate/benchmark/funds`);
  return res.json();
}
