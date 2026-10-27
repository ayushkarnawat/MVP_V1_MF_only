import { useCallback, useSyncExternalStore } from "react";
import { useScope } from "../../../shell/scope/ScopeContext";
import { getToken } from "../../auth/session";
import { getAnalyticsScope, retryAnalyticsScope } from "../api";
import {
  ANALYTICS_SECTION_NAMES,
  type AnalyticsSectionName,
  type AnalyticsSectionState,
  type SectionPayload,
} from "../types";

export interface StoreState {
  sections: Partial<Record<AnalyticsSectionName, AnalyticsSectionState>>;
  recomputing: boolean;
  fetchError: string | null;
  loadedAt: number | null;
}

const EMPTY: StoreState = Object.freeze({
  sections: {},
  recomputing: false,
  fetchError: null,
  loadedAt: null,
});

const POLL_MS = 3000;
const FRESH_MS = 5 * 60 * 1000;

interface CacheEntry {
  state: StoreState;
  listeners: Set<() => void>;
  inFlight: Promise<void> | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, CacheEntry>();

function getEntryKey(scope: string): string {
  const token = getToken() ?? "";
  return `${token}|${scope}`;
}

function isSettled(section?: AnalyticsSectionState): boolean {
  return Boolean(section && (section.payload !== null || section.failed_at !== null));
}

function schedulePolling(scope: string, entry: CacheEntry): void {
  if (entry.pollTimer) {
    clearTimeout(entry.pollTimer);
    entry.pollTimer = null;
  }
  const hasUnsettled = ANALYTICS_SECTION_NAMES.some(name => !isSettled(entry.state.sections[name]));
  const shouldPoll = entry.listeners.size > 0 && (entry.state.recomputing || hasUnsettled);
  if (shouldPoll) {
    entry.pollTimer = setTimeout(() => {
      entry.pollTimer = null;
      void analyticsStore.refresh(scope);
    }, POLL_MS);
  }
}

export const analyticsStore = {
  refresh(scope: string): Promise<void> {
    const key = getEntryKey(scope);
    let entry = cache.get(key);
    if (!entry) {
      entry = {
        state: EMPTY,
        listeners: new Set(),
        inFlight: null,
        pollTimer: null,
      };
      cache.set(key, entry);
    }

    if (entry.inFlight) {
      return entry.inFlight;
    }

    const promise = (async () => {
      try {
        const res = await getAnalyticsScope(scope);
        entry.state = {
          sections: res.sections ?? {},
          recomputing: Boolean(res.recomputing),
          fetchError: null,
          loadedAt: Date.now(),
        };
        schedulePolling(scope, entry);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load analytics data";
        entry.state = {
          ...entry.state,
          fetchError: message || "Failed to load analytics data",
        };
      } finally {
        entry.inFlight = null;
        for (const listener of entry.listeners) {
          listener();
        }
      }
    })();

    entry.inFlight = promise;
    return promise;
  },

  subscribe(scope: string, listener: () => void): () => void {
    const key = getEntryKey(scope);
    let entry = cache.get(key);
    if (!entry) {
      entry = {
        state: EMPTY,
        listeners: new Set(),
        inFlight: null,
        pollTimer: null,
      };
      cache.set(key, entry);
    }

    entry.listeners.add(listener);

    const isStale = entry.state.loadedAt === null || Date.now() - entry.state.loadedAt > FRESH_MS;
    if (isStale) {
      void this.refresh(scope);
    } else {
      schedulePolling(scope, entry);
    }

    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entry.pollTimer) {
        clearTimeout(entry.pollTimer);
        entry.pollTimer = null;
      }
    };
  },

  getSnapshot(scope: string): StoreState {
    const key = getEntryKey(scope);
    return cache.get(key)?.state ?? EMPTY;
  },

  invalidate(scope?: string): void {
    if (scope !== undefined) {
      for (const [key, entry] of cache.entries()) {
        if (key.endsWith(`|${scope}`)) {
          if (entry.pollTimer) {
            clearTimeout(entry.pollTimer);
            entry.pollTimer = null;
          }
          entry.inFlight = null;
          entry.state = EMPTY;
          cache.delete(key);
          for (const listener of entry.listeners) {
            listener();
          }
        }
      }
    } else {
      for (const [, entry] of cache.entries()) {
        if (entry.pollTimer) {
          clearTimeout(entry.pollTimer);
          entry.pollTimer = null;
        }
        entry.inFlight = null;
        entry.state = EMPTY;
        for (const listener of entry.listeners) {
          listener();
        }
      }
      cache.clear();
    }
  },
};

const AGGREGATE_FIELD: Record<string, string> = {
  allocation: "allocation",
  stock_holdings: "stock_holdings",
  valuation: "valuation",
  overlap: "overlap",
  asset_allocation: "asset_allocation",
  cap_allocation: "cap_allocation",
  ter: "ter",
  ter_direct_regular: "ter",
  benchmark: "benchmark",
  benchmark_funds: "comparison",
  category_ranking: "ranking",
  ranking: "ranking",
  score: "score",
  investment_withdrawal: "data",
  fund_manager: "fund_manager",
};

export function useMfAnalytics<S extends AnalyticsSectionName>(name: S): {
  status: "loading" | "ready" | "failed" | "error";
  data: SectionPayload<S> | null;
  retry: () => void;
} {
  const { viewMode, memberId } = useScope();
  const scope = viewMode === "aggregate" ? "combined" : memberId ?? "";

  const snapshot = useSyncExternalStore(
    useCallback(
      onStoreChange => {
        if (!scope) return () => {};
        return analyticsStore.subscribe(scope, onStoreChange);
      },
      [scope]
    ),
    useCallback(() => {
      if (!scope) return EMPTY;
      return analyticsStore.getSnapshot(scope);
    }, [scope]),
    () => EMPTY
  );

  const section = snapshot.sections[name];

  let status: "loading" | "ready" | "failed" | "error" = "loading";
  let data: SectionPayload<S> | null = null;

  if (section && section.payload !== null) {
    status = "ready";
    if (viewMode === "aggregate") {
      const field = AGGREGATE_FIELD[name];
      const payloadObj = section.payload as Record<string, unknown>;
      data = (field && field in payloadObj ? payloadObj[field] : payloadObj) as SectionPayload<S>;
    } else {
      data = section.payload as SectionPayload<S>;
    }
  } else if (section && section.failed_at !== null) {
    status = "failed";
    data = null;
  } else if (snapshot.fetchError !== null) {
    status = "error";
    data = null;
  }

  const retry = useCallback(() => {
    if (!scope) return;
    void Promise.resolve(retryAnalyticsScope(scope))
      .catch(() => {})
      .then(() => analyticsStore.refresh(scope));
  }, [scope]);

  return { status, data, retry };
}
