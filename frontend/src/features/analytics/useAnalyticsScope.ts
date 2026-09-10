import { useCallback, useEffect, useState } from "react";
import { getAnalyticsScope, retryAnalyticsScope } from "./api";
import { ANALYTICS_SECTION_NAMES } from "./types";
import type { AnalyticsSectionName, AnalyticsSectionState } from "./types";

const POLL_INTERVAL_MS = 3000;

export function isSectionSettled(state: AnalyticsSectionState | undefined): boolean {
  return !!state && (state.payload !== null || state.failed_at !== null);
}

export interface UseAnalyticsScopeResult {
  sections: Partial<Record<AnalyticsSectionName, AnalyticsSectionState>>;
  recomputing: boolean;
  fetchError: string | null;
  hasFailedSection: boolean;
  isRetrying: boolean;
  retry: () => Promise<void>;
}

/** Polls GET /analytics/{scope} until every section has settled (a payload landed
 * or it permanently failed) and the backend reports it's done recomputing -- the
 * precompute backend answers a cold-start GET with whatever has landed so far, not
 * a single blocking response (Docs/orchestration/analytics-precompute-implementation-handoff.md).
 * `scope` is "combined" for the household aggregate or a household member's id;
 * pass null when there's nothing to fetch yet (e.g. member mode with no member
 * selected) -- the hook is then a no-op, matching the old per-section fetch's
 * early-return behavior. */
export function useAnalyticsScope(scope: string | null): UseAnalyticsScopeResult {
  const [sections, setSections] = useState<Partial<Record<AnalyticsSectionName, AnalyticsSectionState>>>({});
  const [recomputing, setRecomputing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollGeneration, setPollGeneration] = useState(0);

  useEffect(() => {
    if (!scope) {
      setSections({});
      setFetchError(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = () => {
      getAnalyticsScope(scope, controller.signal)
        .then((res) => {
          if (cancelled) return;
          setSections(res.sections);
          setRecomputing(res.recomputing);
          setFetchError(null);
          const allSettled = ANALYTICS_SECTION_NAMES.every((name) => isSectionSettled(res.sections[name]));
          if (res.recomputing || !allSettled) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        })
        .catch((err: any) => {
          if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
          setFetchError(err.message || "Failed to load analytics data");
        });
    };

    setFetchError(null);
    poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [scope, pollGeneration]);

  const retry = useCallback(async () => {
    if (!scope) return;
    setIsRetrying(true);
    try {
      await retryAnalyticsScope(scope);
    } finally {
      setIsRetrying(false);
      // Bumping this re-runs the effect above with a fresh AbortController and
      // restarts the poll loop, whether the prior loop had already stopped
      // (all sections settled, one or more failed) or was still running.
      setPollGeneration((g) => g + 1);
    }
  }, [scope]);

  const hasFailedSection = ANALYTICS_SECTION_NAMES.some((name) => !!sections[name]?.failed_at);

  return { sections, recomputing, fetchError, hasFailedSection, isRetrying, retry };
}
