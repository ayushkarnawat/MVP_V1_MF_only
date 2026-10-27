import { useCallback, useEffect, useRef, useState } from "react";
import { useScope } from "@/shell/scope/ScopeContext";
import type { Unavailable } from "./types";

export type FundSectionStatus = "loading" | "ready" | "unavailable" | "error";

export interface FundSection<T> {
  status: FundSectionStatus;
  data: T | null;
  reason: string | null;
  error: unknown;
  retry: () => void;
}

interface SectionState<T> {
  status: FundSectionStatus;
  data: T | null;
  reason: string | null;
  error: unknown;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name: unknown }).name === "AbortError";
  }
  return false;
}

export function useFundSection<T>(
  fetcher: (signal: AbortSignal) => Promise<T | Unavailable>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {}
): FundSection<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const enabled = options.enabled ?? true;
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(deps);
  const renderKey = `${key}#${attempt}#${enabled}`;

  const [prevRenderKey, setPrevRenderKey] = useState(renderKey);
  const [state, setState] = useState<SectionState<T>>({
    status: "loading",
    data: null,
    reason: null,
    error: null,
  });

  if (renderKey !== prevRenderKey) {
    setPrevRenderKey(renderKey);
    setState({
      status: "loading",
      data: null,
      reason: null,
      error: null,
    });
  }

  const retry = useCallback(() => {
    setAttempt((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    fetcherRef.current(controller.signal)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (
          body !== null &&
          typeof body === "object" &&
          "status" in body &&
          (body as { status: unknown }).status === "unavailable"
        ) {
          setState({
            status: "unavailable",
            data: null,
            reason: (body as Unavailable).reason,
            error: null,
          });
        } else {
          setState({
            status: "ready",
            data: body as T,
            reason: null,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAbortError(error)) return;
        setState({
          status: "error",
          data: null,
          reason: null,
          error,
        });
      });

    return () => {
      controller.abort();
    };
  }, [key, attempt, enabled]);

  const currentStatus = renderKey !== prevRenderKey ? "loading" : state.status;
  const currentData = renderKey !== prevRenderKey ? null : state.data;
  const currentReason = renderKey !== prevRenderKey ? null : state.reason;
  const currentError = renderKey !== prevRenderKey ? null : state.error;

  return {
    status: currentStatus,
    data: currentData,
    reason: currentReason,
    error: currentError,
    retry,
  };
}

export function useFundPageScope(): string {
  const { viewMode, memberId } = useScope();
  return viewMode === "member" && memberId ? memberId : "combined";
}
