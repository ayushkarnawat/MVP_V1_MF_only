import { useCallback, useEffect, useRef, useState } from "react";

export type PortfolioSection<T> = {
  status: "loading" | "data" | "error";
  data: T | null;
  error: unknown;
  retry: () => void;
};

interface SectionState<T> {
  status: "loading" | "data" | "error";
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

export function usePortfolioSection<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[]
): PortfolioSection<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(deps);
  const renderKey = `${key}#${attempt}`;

  const [prevRenderKey, setPrevRenderKey] = useState(renderKey);
  const [state, setState] = useState<SectionState<T>>({
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
    setAttempt((c) => c + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadRef.current(controller.signal)
      .then((data) => {
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
  }, [key, attempt]);

  const currentStatus = renderKey !== prevRenderKey ? "loading" : state.status;
  const currentData = renderKey !== prevRenderKey ? null : state.data;
  const currentError = renderKey !== prevRenderKey ? null : state.error;

  return {
    status: currentStatus,
    data: currentData,
    error: currentError,
    retry,
  };
}
