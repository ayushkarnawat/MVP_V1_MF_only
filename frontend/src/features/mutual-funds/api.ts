import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { sumDecimalStrings } from "../../lib/decimal";
import { getToken } from "../auth/session";
import type {
  AllocationSummary,
  AnalyticsScopeResponse,
  CoverageGapItem,
  FamilyMemberStatus,
  HistoryPoint,
  HoldingRow,
  MfScopeArg,
  MonthDetail,
  RealizedSummary,
  SipMonthlyRow,
  SipRow,
  SnapshotRow,
  XirrBundle,
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

export function mfPath(scope: MfScopeArg, suffix: string): string {
  if (scope.viewMode === "aggregate") {
    return `/household/aggregate/${suffix}`;
  }
  if (scope.memberId == null) {
    throw new Error("memberId is required for member scope");
  }
  return `/household-members/${encodeURIComponent(scope.memberId)}/${suffix}`;
}

export interface HoldingsBundle {
  holdings: HoldingRow[];
  members: FamilyMemberStatus[];
  xirr: XirrBundle;
  realized: RealizedSummary | null;
}

export async function getHoldingsBundle(scope: MfScopeArg, signal?: AbortSignal): Promise<HoldingsBundle> {
  const res = await authFetch(mfPath(scope, "holdings"), { signal });
  const body = await res.json();
  return {
    holdings: body.holdings ?? [],
    members: body.members ?? [],
    xirr: {
      lifetime: body.lifetime_xirr ?? null,
      current: body.current_holdings_xirr ?? null,
      disclaimers: {
        lifetime: body.lifetime_xirr_disclaimer ?? null,
        current: body.current_holdings_xirr_disclaimer ?? null,
      },
    },
    realized: body.realized_summary ?? null,
  };
}

export async function getAllocation(scope: MfScopeArg, signal?: AbortSignal): Promise<AllocationSummary> {
  const res = await authFetch(mfPath(scope, "allocation"), { signal });
  const body = await res.json();
  return body && typeof body === "object" && "allocation" in body ? body.allocation : body;
}

export async function getSips(scope: MfScopeArg, includeStopped?: boolean, signal?: AbortSignal): Promise<SipRow[]> {
  const query = includeStopped ? "?include_stopped=true" : "";
  const res = await authFetch(`${mfPath(scope, "sips")}${query}`, { signal });
  const body = await res.json();
  return body && typeof body === "object" && "sips" in body ? body.sips : body;
}

export async function getSipsMonthly(
  scope: MfScopeArg,
  year: number,
  month: number,
  signal?: AbortSignal
): Promise<SipMonthlyRow[]> {
  const res = await authFetch(`${mfPath(scope, "sips/monthly")}?year=${year}&month=${month}`, { signal });
  const body = await res.json();
  return body && typeof body === "object" && "sips" in body ? body.sips : body;
}

export async function getCoverageGaps(memberId: string, signal?: AbortSignal): Promise<CoverageGapItem[]> {
  const res = await authFetch(mfPath({ viewMode: "member", memberId }, "coverage-gaps"), { signal });
  return await res.json();
}

export async function getMonthDetail(scope: MfScopeArg, month: string, signal?: AbortSignal): Promise<MonthDetail> {
  const res = await authFetch(mfPath(scope, `snapshots/${encodeURIComponent(month)}`), { signal });
  return await res.json();
}

export async function getHistoryPoints(scope: MfScopeArg, signal?: AbortSignal): Promise<HistoryPoint[]> {
  if (scope.viewMode === "member" && !scope.memberId) {
    return [];
  }
  const res = await authFetch(mfPath(scope, "snapshots"), { signal });
  const body = await res.json();
  const rows: SnapshotRow[] = Array.isArray(body) ? body : (body.snapshots ?? []);

  const byMonth = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const list = byMonth.get(row.snapshot_month);
    if (list) {
      list.push(row);
    } else {
      byMonth.set(row.snapshot_month, [row]);
    }
  }

  const points: HistoryPoint[] = [];
  for (const [month, monthRows] of byMonth.entries()) {
    const valueText = sumDecimalStrings(monthRows.map(r => r.total_value));
    const hasMissingInvested = monthRows.some(r => r.invested_value == null);
    const investedText = hasMissingInvested ? null : sumDecimalStrings(monthRows.map(r => r.invested_value!));
    const partial = monthRows.some(r => Boolean(r.is_partial));
    const missing = monthRows.flatMap(r => r.missing_scheme_names ?? []);
    const value = Number(valueText);
    const invested = investedText != null ? Number(investedText) : null;
    points.push({
      month,
      value,
      invested,
      valueText,
      investedText,
      partial,
      missing,
    });
  }

  points.sort((a, b) => a.month.localeCompare(b.month));
  return points;
}

export async function getAnalyticsScope(scope: string, signal?: AbortSignal): Promise<AnalyticsScopeResponse> {
  const res = await authFetch(`/analytics/${encodeURIComponent(scope)}`, { signal });
  return await res.json();
}

export async function retryAnalyticsScope(scope: string): Promise<unknown> {
  const res = await authFetch(`/analytics/${encodeURIComponent(scope)}/retry`, { method: "POST" });
  return await res.json();
}
