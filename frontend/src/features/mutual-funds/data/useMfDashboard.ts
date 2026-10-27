import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScope } from "../../../shell/scope/ScopeContext";
import { getAllocation, getCoverageGaps, getHistoryPoints, getHoldingsBundle, getSips } from "../api";
import type {
  AllocationSummary,
  CoverageGapItem,
  FamilyMemberStatus,
  HistoryPoint,
  HoldingRow,
  Load,
  MfScopeArg,
  RealizedSummary,
  SipRow,
  XirrBundle,
} from "../types";

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name: unknown }).name === "AbortError";
  }
  return false;
}

export function useMfSection<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[]
): Load<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [attempt, setAttempt] = useState(0);
  const key = `${JSON.stringify(deps)}#${attempt}`;

  const [prevKey, setPrevKey] = useState(key);
  const [state, setState] = useState<{
    status: "loading" | "data" | "error";
    data: T | null;
  }>({
    status: "loading",
    data: null,
  });

  if (key !== prevKey) {
    setPrevKey(key);
    setState({
      status: "loading",
      data: null,
    });
  }

  const retry = useCallback(() => {
    setAttempt(c => c + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadRef.current(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setState({ status: "data", data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAbortError(error)) return;
        setState({ status: "error", data: null });
      });

    return () => {
      controller.abort();
    };
  }, [key]);

  const currentStatus = key !== prevKey ? "loading" : state.status;
  const currentData = key !== prevKey ? null : state.data;

  return {
    status: currentStatus,
    data: currentData,
    retry,
  };
}

export interface MfHoldings {
  holdings: Load<HoldingRow[]>;
  xirr: Load<XirrBundle>;
  realized: Load<RealizedSummary | null>;
  members: Load<FamilyMemberStatus[]>;
}

export function useMfHoldings(): MfHoldings {
  const { viewMode, memberId } = useScope();
  const scope: MfScopeArg = useMemo(() => ({ viewMode, memberId }), [viewMode, memberId]);

  const bundleLoad = useMfSection(
    useCallback((signal: AbortSignal) => getHoldingsBundle(scope, signal), [scope]),
    [viewMode, memberId]
  );

  const { status, retry, data } = bundleLoad;

  return {
    holdings: { status, retry, data: data?.holdings ?? null },
    xirr: { status, retry, data: data?.xirr ?? null },
    realized: { status, retry, data: data?.realized ?? null },
    members: { status, retry, data: data?.members ?? null },
  };
}

export function useMfHistory(): Load<HistoryPoint[]> {
  const { viewMode, memberId } = useScope();
  const scope: MfScopeArg = useMemo(() => ({ viewMode, memberId }), [viewMode, memberId]);

  return useMfSection(
    useCallback((signal: AbortSignal) => getHistoryPoints(scope, signal), [scope]),
    [viewMode, memberId]
  );
}

export interface MfDashboard extends MfHoldings {
  allocation: Load<AllocationSummary>;
  sips: Load<SipRow[]>;
  coverageGaps: Load<CoverageGapItem[]>;
  history: Load<HistoryPoint[]>;
}

export function useMfDashboard(): MfDashboard {
  const { viewMode, memberId } = useScope();
  const scope: MfScopeArg = useMemo(() => ({ viewMode, memberId }), [viewMode, memberId]);

  const holdings = useMfHoldings();
  const history = useMfHistory();

  const allocation = useMfSection(
    useCallback((signal: AbortSignal) => getAllocation(scope, signal), [scope]),
    [viewMode, memberId]
  );

  const sips = useMfSection(
    useCallback((signal: AbortSignal) => getSips(scope, true, signal), [scope]),
    [viewMode, memberId]
  );

  const coverageGaps = useMfSection(
    useCallback(
      (signal: AbortSignal) => {
        if (viewMode === "member" && memberId) {
          return getCoverageGaps(memberId, signal);
        }
        return Promise.resolve<CoverageGapItem[]>([]);
      },
      [viewMode, memberId]
    ),
    [viewMode, memberId]
  );

  return {
    ...holdings,
    allocation,
    sips,
    coverageGaps,
    history,
  };
}
