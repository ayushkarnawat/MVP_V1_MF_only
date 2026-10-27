import { useCallback, useEffect, useRef, useState } from "react";
import { invalidateApiCache } from "../../lib/apiClient";
import { getNews } from "./api";
import type { HomeScopeArg, NewsResponse } from "./types";
import { useHomeSection } from "./useHomeSection";

export const NEWS_FOCUS_THROTTLE_MS = 5 * 60 * 1000;

export interface NewsSection {
  status: "loading" | "data" | "error";
  data: NewsResponse | null;
  refreshing: boolean;
  refresh: () => void;
}

// The first answer comes from useHomeSection like every other section. A later refresh (the button, or
// coming back to the tab) keeps the headlines on screen and swaps them when the new answer arrives; a
// failed refresh changes nothing. Changing scope forgets all of it, so one member's news never shows
// under another.
export function useNews(scope: HomeScopeArg, scopeKey: string): NewsSection {
  const base = useHomeSection(signal => getNews(scope, signal), [scopeKey]);

  const [latest, setLatest] = useState<{ key: string; data: NewsResponse } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const keyRef = useRef(scopeKey);
  keyRef.current = scopeKey;
  const inFlight = useRef<AbortController | null>(null);
  const checkedAt = useRef<number | null>(null);

  useEffect(() => {
    if (base.status === "data") checkedAt.current = Date.now();
  }, [base.status, base.data]);

  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      checkedAt.current = null;
      setLatest(null);
      setRefreshing(false);
    };
  }, [scopeKey]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const key = keyRef.current;
    checkedAt.current = Date.now();
    setRefreshing(true);
    // The client caches GET answers for a minute; a refresh must reach the server.
    invalidateApiCache();
    getNews(scopeRef.current, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setLatest({ key, data });
      })
      .catch(() => {})
      .finally(() => {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setRefreshing(false);
        }
      });
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (checkedAt.current === null) return;
      if (Date.now() - checkedAt.current < NEWS_FOCUS_THROTTLE_MS) return;
      refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  const fresh = latest !== null && latest.key === scopeKey ? latest.data : null;
  return {
    status: fresh ? "data" : base.status,
    data: fresh ?? base.data,
    refreshing,
    refresh,
  };
}
