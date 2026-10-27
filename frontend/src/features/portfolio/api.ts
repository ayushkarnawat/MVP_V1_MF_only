import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "@/lib/apiClient";
import { getToken } from "../auth/session";
import type {
  PortfolioAllocationResponse,
  PortfolioInsightsResponse,
  PortfolioScopeArg,
  PortfolioSectionName,
  PortfolioSummaryResponse,
  PortfolioValueSeriesResponse,
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

export function portfolioPath(
  scope: PortfolioScopeArg,
  section: PortfolioSectionName,
  query?: Record<string, string | undefined>
): string {
  let base: string;
  if (scope.viewMode === "aggregate") {
    base = `/household/aggregate/${section}`;
  } else {
    if (scope.memberId == null) {
      throw new Error("memberId is required for member scope");
    }
    base = `/household-members/${encodeURIComponent(scope.memberId)}/${section}`;
  }

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value.length > 0) {
        params.append(key, value);
      }
    }
    const qs = params.toString();
    if (qs.length > 0) {
      return `${base}?${qs}`;
    }
  }

  return base;
}

export async function getPortfolioSummary(
  scope: PortfolioScopeArg,
  signal?: AbortSignal
): Promise<PortfolioSummaryResponse> {
  const res = await authFetch(portfolioPath(scope, "portfolio-summary"), { signal });
  return res.json();
}

export async function getPortfolioAllocation(
  scope: PortfolioScopeArg,
  signal?: AbortSignal
): Promise<PortfolioAllocationResponse> {
  const res = await authFetch(portfolioPath(scope, "portfolio-allocation"), { signal });
  return res.json();
}

export async function getPortfolioValueSeries(
  scope: PortfolioScopeArg,
  days: number,
  signal?: AbortSignal
): Promise<PortfolioValueSeriesResponse> {
  const res = await authFetch(
    portfolioPath(scope, "portfolio-value-series", { days: String(days) }),
    { signal }
  );
  return res.json();
}

export async function getPortfolioInsights(
  scope: PortfolioScopeArg,
  signal?: AbortSignal
): Promise<PortfolioInsightsResponse> {
  const res = await authFetch(portfolioPath(scope, "portfolio-insights"), { signal });
  return res.json();
}
