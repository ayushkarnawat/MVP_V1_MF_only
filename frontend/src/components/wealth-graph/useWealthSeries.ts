import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "@/lib/apiClient";
import type {
  WealthDateRange,
  WealthPeriod,
  WealthScope,
  WealthSeriesData,
  WealthSeriesLoader,
  WealthSeriesQuery,
  WealthSeriesStatus,
} from "./types";

export interface UseWealthSeriesOptions<T extends WealthSeriesData = WealthSeriesData> {
  loadSeries?: WealthSeriesLoader<T>;
  enabled?: boolean;
}

export interface WealthSeriesResult<T extends WealthSeriesData = WealthSeriesData> {
  status: WealthSeriesStatus;
  data: T | null;
  error: unknown;
  refreshing: boolean;
  retry: () => void;
}

interface RawState<T> {
  status: WealthSeriesStatus;
  data: T | null;
  error: unknown;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name: unknown }).name === "AbortError";
  }
  return false;
}

export function wealthSeriesPath(scope: WealthScope, query: WealthSeriesQuery): string {
  let base: string;
  if (scope.viewMode === "aggregate") {
    base = "/household/aggregate/home/wealth-series";
  } else {
    if (scope.memberId == null) {
      throw new Error("memberId is required for member scope");
    }
    base = `/household-members/${encodeURIComponent(scope.memberId)}/home/wealth-series`;
  }

  const params = new URLSearchParams();
  params.append("period", query.period);
  if (query.from) params.append("from", query.from);
  if (query.to) params.append("to", query.to);
  if (query.benchmark) params.append("benchmark", query.benchmark);

  const qs = params.toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

async function defaultLoadSeries<T extends WealthSeriesData>(
  scope: WealthScope,
  query: WealthSeriesQuery,
  signal?: AbortSignal,
): Promise<T> {
  const res = await cachedFetch(`${API_BASE_URL}${wealthSeriesPath(scope, query)}`, { signal });
  if (!res.ok) {
    const errorPayload = await parseErrorDetail(res);
    throw new ApiError(res.status, errorPayload);
  }
  return res.json() as Promise<T>;
}

export function useWealthSeries<T extends WealthSeriesData = WealthSeriesData>(
  scope: WealthScope,
  period: WealthPeriod,
  range: WealthDateRange | null,
  benchmarks: readonly string[],
  options?: UseWealthSeriesOptions<T>,
): WealthSeriesResult<T> {
  const enabled = options?.enabled ?? true;
  const loaderRef = useRef<WealthSeriesLoader<T>>(options?.loadSeries ?? defaultLoadSeries);
  loaderRef.current = options?.loadSeries ?? defaultLoadSeries;

  const scopeKey = scope.viewMode === "aggregate" ? "aggregate" : `member:${scope.memberId ?? ""}`;
  // Until backend task D-4 lands, the wealth-series route accepts a single benchmark only.
  const firstBenchmark = benchmarks.length > 0 && benchmarks[0] ? benchmarks[0] : undefined;
  const from = period === "custom" ? (range?.from ?? undefined) : undefined;
  const to = period === "custom" ? (range?.to ?? undefined) : undefined;
  const ready = enabled && (period !== "custom" || Boolean(from && to));

  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([scopeKey, period, from ?? null, to ?? null, firstBenchmark ?? null, ready]);
  const renderKey = `${requestKey}#${attempt}`;

  const [prevRenderKey, setPrevRenderKey] = useState(renderKey);
  const [state, setState] = useState<RawState<T>>({
    status: "loading",
    data: null,
    error: null,
  });

  if (renderKey !== prevRenderKey) {
    setPrevRenderKey(renderKey);
    setState({
      status: "loading",
      data: null,
      error: null,
    });
  }

  const retry = useCallback(() => {
    setAttempt(c => c + 1);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const controller = new AbortController();
    const query: WealthSeriesQuery = {
      period,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(firstBenchmark ? { benchmark: firstBenchmark } : {}),
    };

    loaderRef.current(scopeRef.current, query, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setState({ status: "data", data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAbortError(error)) return;
        setState({ status: "error", data: null, error });
      });

    return () => {
      controller.abort();
    };
  }, [requestKey, attempt, ready, period, from, to, firstBenchmark]);

  const currentStatus: WealthSeriesStatus = renderKey !== prevRenderKey ? "loading" : state.status;
  const currentData = renderKey !== prevRenderKey ? null : state.data;
  const currentError = renderKey !== prevRenderKey ? null : state.error;

  const [kept, setKept] = useState<{ key: string; data: T } | null>(null);

  if (currentStatus === "data" && currentData !== null) {
    if (kept === null || kept.key !== scopeKey || kept.data !== currentData) {
      setKept({ key: scopeKey, data: currentData });
    }
  } else if (currentStatus === "error" && kept !== null) {
    setKept(null);
  }

  if (currentStatus === "loading" && kept !== null && kept.key === scopeKey) {
    return {
      status: "data",
      data: kept.data,
      error: currentError,
      refreshing: true,
      retry,
    };
  }

  return {
    status: currentStatus,
    data: currentData,
    error: currentError,
    refreshing: false,
    retry,
  };
}
