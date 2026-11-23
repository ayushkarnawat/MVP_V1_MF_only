import { useMemo, useSyncExternalStore } from "react";
import { getChecklistStore, supportsChecklist } from "./checklistStore";

export function useCamsChecklist(memberId: string) {
  const store = useMemo(() => {
    const entry = getChecklistStore(memberId);
    entry.refresh();
    return entry;
  }, [memberId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    supported: supportsChecklist(),
    mode: snapshot.mode, step: snapshot.step, ticks: snapshot.ticks,
    camsLink: snapshot.camsLink,
    open: store.open, close: store.close, focus: store.focus, reopen: store.reopen,
    startOver: store.startOver, toggle: store.toggle, setCamsLink: store.setCamsLink,
    markSubmitted: store.markSubmitted, markFileReady: store.markFileReady,
  };
}

export type CamsChecklistApi = ReturnType<typeof useCamsChecklist>;
