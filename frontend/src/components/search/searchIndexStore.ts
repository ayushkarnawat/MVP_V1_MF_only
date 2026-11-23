import { onApiCacheInvalidated } from "../../lib/apiClient";
import { clearRecents } from "./recentSearches";
import { fetchSearchIndex } from "./searchApi";
import type { SearchIndexResponse } from "./searchTypes";

export type SearchIndexStatus = "idle" | "loading" | "ready" | "error";

export interface SearchIndexState {
  status: SearchIndexStatus;
  data: SearchIndexResponse | null;
}

interface TokenEntry {
  state: SearchIndexState;
  stale: boolean;
  inFlight: Promise<void> | null;
  abortController: AbortController | null;
}

const IDLE_STATE: SearchIndexState = { status: "idle", data: null };

const entries = new Map<string | null, TokenEntry>();
const listeners = new Set<() => void>();
let generation = 0;
let activeToken: string | null | undefined;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function startFetch(token: string | null): Promise<void> {
  const existing = entries.get(token);
  if (existing?.inFlight) {
    return existing.inFlight;
  }

  // Abort any in-flight request for a different token so a slow response never
  // overtakes the current user's session.
  if (activeToken !== undefined && activeToken !== token) {
    const previous = entries.get(activeToken);
    if (previous?.inFlight) {
      previous.abortController?.abort();
      entries.delete(activeToken);
    }
  }

  generation += 1;
  const requestGen = generation;
  activeToken = token;

  const abortController = new AbortController();
  const prevData = existing?.stale ? existing.state.data : null;

  const entry: TokenEntry = {
    state: { status: "loading", data: prevData },
    stale: false,
    inFlight: null,
    abortController,
  };
  entries.set(token, entry);
  notify();

  const promise = fetchSearchIndex(token, abortController.signal)
    .then((data) => {
      if (requestGen !== generation || entries.get(token) !== entry) {
        return;
      }
      entry.state = { status: "ready", data };
      entry.stale = false;
      entry.inFlight = null;
      entry.abortController = null;
      notify();
    })
    .catch(() => {
      if (requestGen !== generation || entries.get(token) !== entry) {
        return;
      }
      entry.state = { status: "error", data: null };
      entry.stale = false;
      entry.inFlight = null;
      entry.abortController = null;
      notify();
    });

  entry.inFlight = promise;
  return promise;
}

export function getSearchIndexState(token: string | null): SearchIndexState {
  return entries.get(token)?.state ?? IDLE_STATE;
}

export function subscribeSearchIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadSearchIndex(token: string | null): Promise<void> {
  const existing = entries.get(token);
  if (existing?.inFlight) {
    return existing.inFlight;
  }
  if (existing?.state.status === "ready" && !existing.stale) {
    return Promise.resolve();
  }
  return startFetch(token);
}

export function retrySearchIndex(token: string | null): Promise<void> {
  return startFetch(token);
}

export function invalidateSearchIndex(): void {
  for (const entry of entries.values()) {
    entry.stale = true;
  }
}

export function clearSearchState(): void {
  generation += 1;
  activeToken = undefined;
  for (const entry of entries.values()) {
    entry.abortController?.abort();
  }
  entries.clear();
  clearRecents();
  notify();
}

// The GET cache is cleared after every data change (an import, a delete, a profile edit): the index is a copy of the
// household's data and goes stale with it. The next load refetches.
onApiCacheInvalidated(invalidateSearchIndex);
