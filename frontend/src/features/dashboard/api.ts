import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  HoldingRow,
  AllocationSummary,
  SipRow,
  SipMonthlyRow,
  CashFlowEntry,
  SnapshotRow,
  AggregateHoldingsResponse,
  AggregateAllocationResponse,
  AggregateSipsResponse,
  AggregateSipsMonthlyResponse,
  AggregateCashFlowResponse,
  AggregateSnapshotsResponse,
  DistributorComparisonRow,
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

/* Per-member Dashboard API */
export async function getMemberHoldings(memberId: string, signal?: AbortSignal): Promise<HoldingRow[]> {
  const res = await authFetch(`/household-members/${memberId}/holdings`, { signal });
  return res.json();
}

export async function getMemberAllocation(memberId: string, signal?: AbortSignal): Promise<AllocationSummary> {
  const res = await authFetch(`/household-members/${memberId}/allocation`, { signal });
  return res.json();
}

export async function getMemberSips(memberId: string, signal?: AbortSignal): Promise<SipRow[]> {
  const res = await authFetch(`/household-members/${memberId}/sips`, { signal });
  return res.json();
}

export async function getMemberSipsMonthly(
  memberId: string,
  year: number,
  month: number,
  signal?: AbortSignal
): Promise<SipMonthlyRow[]> {
  const res = await authFetch(
    `/household-members/${memberId}/sips/monthly?year=${year}&month=${month}`,
    { signal }
  );
  return res.json();
}

export async function getMemberCashFlow(memberId: string): Promise<CashFlowEntry[]> {
  const res = await authFetch(`/household-members/${memberId}/cash-flow`);
  return res.json();
}

export async function getMemberSnapshots(memberId: string): Promise<SnapshotRow[]> {
  const res = await authFetch(`/household-members/${memberId}/snapshots`);
  return res.json();
}

export async function getDistributorComparison(
  memberId: string,
  schemeId: string
): Promise<DistributorComparisonRow[]> {
  const res = await authFetch(
    `/household-members/${memberId}/schemes/${schemeId}/distributor-comparison`
  );
  return res.json();
}

/* Family Aggregate Dashboard API */
export async function getAggregateHoldings(signal?: AbortSignal): Promise<AggregateHoldingsResponse> {
  const res = await authFetch(`/household/aggregate/holdings`, { signal });
  return res.json();
}

export async function getAggregateAllocation(signal?: AbortSignal): Promise<AggregateAllocationResponse> {
  const res = await authFetch(`/household/aggregate/allocation`, { signal });
  return res.json();
}

export async function getAggregateSips(signal?: AbortSignal): Promise<AggregateSipsResponse> {
  const res = await authFetch(`/household/aggregate/sips`, { signal });
  return res.json();
}

export async function getAggregateSipsMonthly(
  year: number,
  month: number,
  signal?: AbortSignal
): Promise<AggregateSipsMonthlyResponse> {
  const res = await authFetch(
    `/household/aggregate/sips/monthly?year=${year}&month=${month}`,
    { signal }
  );
  return res.json();
}

export async function getAggregateCashFlow(): Promise<AggregateCashFlowResponse> {
  const res = await authFetch(`/household/aggregate/cash-flow`);
  return res.json();
}

export async function getAggregateSnapshots(): Promise<AggregateSnapshotsResponse> {
  const res = await authFetch(`/household/aggregate/snapshots`);
  return res.json();
}
