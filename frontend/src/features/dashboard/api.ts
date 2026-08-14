import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  HoldingRow,
  AllocationSummary,
  SipRow,
  CashFlowEntry,
  SnapshotRow,
  AggregateHoldingsResponse,
  AggregateAllocationResponse,
  AggregateSipsResponse,
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
export async function getMemberHoldings(memberId: string): Promise<HoldingRow[]> {
  const res = await authFetch(`/household-members/${memberId}/holdings`);
  return res.json();
}

export async function getMemberAllocation(memberId: string): Promise<AllocationSummary> {
  const res = await authFetch(`/household-members/${memberId}/allocation`);
  return res.json();
}

export async function getMemberSips(memberId: string): Promise<SipRow[]> {
  const res = await authFetch(`/household-members/${memberId}/sips`);
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
export async function getAggregateHoldings(): Promise<AggregateHoldingsResponse> {
  const res = await authFetch(`/household/aggregate/holdings`);
  return res.json();
}

export async function getAggregateAllocation(): Promise<AggregateAllocationResponse> {
  const res = await authFetch(`/household/aggregate/allocation`);
  return res.json();
}

export async function getAggregateSips(): Promise<AggregateSipsResponse> {
  const res = await authFetch(`/household/aggregate/sips`);
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
