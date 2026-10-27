import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "@/lib/apiClient";
import { getToken } from "../auth/session";
import type {
  CategoryReturnsResponse,
  CategorySeriesResponse,
  CompositionResponse,
  FolioNumberResponse,
  HoldingsListResponse,
  InsightsResponse,
  ManagerResponse,
  PerformancePeriod,
  PerformanceResponse,
  PeriodReturnsPeriod,
  PeriodReturnsResponse,
  ReturnsMode,
  ReturnsResponse,
  RiskResponse,
  RollingResponse,
  RollingWindow,
  ScatterResponse,
  ScoreResponse,
  SummaryResponse,
  Unavailable,
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

export function fundPagePath(
  schemeId: string,
  route: string,
  query?: Record<string, string | undefined>
): string {
  const base = `/fund-page/${encodeURIComponent(schemeId)}/${route}`;
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

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await authFetch(path, { signal });
  return res.json();
}

export const fundPageApi = {
  summary(schemeId: string, scope: string, signal?: AbortSignal): Promise<SummaryResponse> {
    return get<SummaryResponse>(fundPagePath(schemeId, "summary", { scope }), signal);
  },

  folioNumber(schemeId: string, folioId: string, signal?: AbortSignal): Promise<FolioNumberResponse> {
    return get<FolioNumberResponse>(
      fundPagePath(schemeId, `folios/${encodeURIComponent(folioId)}/number`),
      signal
    );
  },

  performance(
    schemeId: string,
    period: PerformancePeriod,
    signal?: AbortSignal
  ): Promise<PerformanceResponse | Unavailable> {
    return get<PerformanceResponse | Unavailable>(
      fundPagePath(schemeId, "performance", { period }),
      signal
    );
  },

  returns(
    schemeId: string,
    mode: ReturnsMode,
    scope: string,
    signal?: AbortSignal
  ): Promise<ReturnsResponse | Unavailable> {
    return get<ReturnsResponse | Unavailable>(
      fundPagePath(schemeId, "returns", { mode, scope }),
      signal
    );
  },

  risk(schemeId: string, signal?: AbortSignal): Promise<RiskResponse | Unavailable> {
    return get<RiskResponse | Unavailable>(fundPagePath(schemeId, "risk"), signal);
  },

  composition(schemeId: string, signal?: AbortSignal): Promise<CompositionResponse | Unavailable> {
    return get<CompositionResponse | Unavailable>(
      fundPagePath(schemeId, "portfolio-composition"),
      signal
    );
  },

  holdings(schemeId: string, signal?: AbortSignal): Promise<HoldingsListResponse | Unavailable> {
    return get<HoldingsListResponse | Unavailable>(fundPagePath(schemeId, "holdings"), signal);
  },

  manager(schemeId: string, signal?: AbortSignal): Promise<ManagerResponse | Unavailable> {
    return get<ManagerResponse | Unavailable>(fundPagePath(schemeId, "manager"), signal);
  },

  score(schemeId: string, scope: string, signal?: AbortSignal): Promise<ScoreResponse | Unavailable> {
    return get<ScoreResponse | Unavailable>(fundPagePath(schemeId, "score", { scope }), signal);
  },

  categorySeries(
    schemeId: string,
    period: PerformancePeriod,
    signal?: AbortSignal
  ): Promise<CategorySeriesResponse | Unavailable> {
    return get<CategorySeriesResponse | Unavailable>(
      fundPagePath(schemeId, "peers/series", { period }),
      signal
    );
  },

  categoryReturns(
    schemeId: string,
    signal?: AbortSignal
  ): Promise<CategoryReturnsResponse | Unavailable> {
    return get<CategoryReturnsResponse | Unavailable>(
      fundPagePath(schemeId, "peers/returns"),
      signal
    );
  },

  rolling(
    schemeId: string,
    windowYears: RollingWindow,
    signal?: AbortSignal
  ): Promise<RollingResponse | Unavailable> {
    return get<RollingResponse | Unavailable>(
      fundPagePath(schemeId, "peers/rolling", { window: String(windowYears) }),
      signal
    );
  },

  periodReturns(
    schemeId: string,
    period: PeriodReturnsPeriod,
    signal?: AbortSignal
  ): Promise<PeriodReturnsResponse | Unavailable> {
    return get<PeriodReturnsResponse | Unavailable>(
      fundPagePath(schemeId, "peers/period-returns", { period }),
      signal
    );
  },

  scatter(schemeId: string, signal?: AbortSignal): Promise<ScatterResponse | Unavailable> {
    return get<ScatterResponse | Unavailable>(fundPagePath(schemeId, "peers/scatter"), signal);
  },

  insights(schemeId: string, scope: string, signal?: AbortSignal): Promise<InsightsResponse | Unavailable> {
    return get<InsightsResponse | Unavailable>(
      fundPagePath(schemeId, "insights", { scope }),
      signal
    );
  },
};
