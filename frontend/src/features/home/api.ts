import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type {
  AllocationResponse,
  BenchmarksResponse,
  HomeScopeArg,
  HomeSectionName,
  MoversAllResponse,
  MoversResponse,
  MoversView,
  NewsResponse,
  SummaryResponse,
  WealthSeriesQuery,
  WealthSeriesResponse,
  WorthResponse,
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

export function homePath(
  scope: HomeScopeArg,
  section: HomeSectionName,
  query?: Record<string, string | readonly string[] | undefined>
): string {
  let base: string;
  if (scope.viewMode === "aggregate") {
    base = `/household/aggregate/home/${section}`;
  } else {
    if (scope.memberId == null) {
      throw new Error("memberId is required for member scope");
    }
    base = `/household-members/${encodeURIComponent(scope.memberId)}/home/${section}`;
  }

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") {
        if (value.length > 0) {
          params.append(key, value);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.length > 0) {
            params.append(key, item);
          }
        }
      }
    }
    const qs = params.toString();
    if (qs.length > 0) {
      return `${base}?${qs}`;
    }
  }

  return base;
}

export async function getHomeSummary(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<SummaryResponse> {
  const res = await authFetch(homePath(scope, "summary"), { signal });
  return res.json();
}

export async function getAllocation(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<AllocationResponse> {
  const res = await authFetch(homePath(scope, "allocation"), { signal });
  return res.json();
}

export async function getWorthALook(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<WorthResponse> {
  const res = await authFetch(homePath(scope, "worth-a-look"), { signal });
  return res.json();
}

export async function getBenchmarks(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<BenchmarksResponse> {
  const res = await authFetch(homePath(scope, "benchmarks"), { signal });
  return res.json();
}

export async function getWealthSeries(
  scope: HomeScopeArg,
  query: WealthSeriesQuery,
  signal?: AbortSignal
): Promise<WealthSeriesResponse> {
  const res = await authFetch(
    homePath(scope, "wealth-series", {
      period: query.period,
      from: query.from,
      to: query.to,
      benchmark: query.benchmark,
      benchmarks: query.benchmarks,
    }),
    { signal }
  );
  return res.json();
}

export async function getMovers(
  scope: HomeScopeArg,
  by: MoversView,
  signal?: AbortSignal
): Promise<MoversResponse> {
  const res = await authFetch(homePath(scope, "movers", { by }), { signal });
  return res.json();
}

export async function getMoversAll(
  scope: HomeScopeArg,
  by: MoversView,
  signal?: AbortSignal
): Promise<MoversAllResponse> {
  const res = await authFetch(homePath(scope, "movers", { by, all: "true" }), { signal });
  return res.json();
}

export async function getNews(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<NewsResponse> {
  const res = await authFetch(homePath(scope, "news"), { signal });
  return res.json();
}

