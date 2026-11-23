import { useCallback, useSyncExternalStore } from "react";
import { getToken } from "@/features/auth/session";
import {
  getSearchIndexState,
  loadSearchIndex,
  retrySearchIndex,
  subscribeSearchIndex,
  type SearchIndexStatus,
} from "./searchIndexStore";
import type { SearchIndexResponse } from "./searchTypes";

export function useSearchIndex(): {
  status: SearchIndexStatus;
  data: SearchIndexResponse | null;
  retry(): void;
  load(): void;
} {
  const state = useSyncExternalStore(subscribeSearchIndex, () =>
    getSearchIndexState(getToken()),
  );

  const load = useCallback(() => {
    void loadSearchIndex(getToken());
  }, []);

  const retry = useCallback(() => {
    void retrySearchIndex(getToken());
  }, []);

  return {
    status: state.status,
    data: state.data,
    retry,
    load,
  };
}
