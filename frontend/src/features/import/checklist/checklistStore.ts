import { clearChecklistState, getChecklistState, setChecklistState, type ChecklistState } from "../casResumeState";
import { checklistCopy } from "./checklistCopy";

export interface CamsLink {
  state: "preparing" | "ready" | "failed";
  error: string | null;
  url: string | null;
}

export interface ChecklistWindow {
  document: Document;
  closed: boolean;
  focus(): void;
  close(): void;
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
}

type ChecklistMode = "closed" | "window" | "panel";
interface ChecklistSnapshot extends ChecklistState {
  mode: ChecklistMode;
  camsLink: CamsLink;
  pipWindow: ChecklistWindow | null;
  finishedFromChecklist: boolean;
}

function initialState(memberId: string): ChecklistSnapshot {
  const saved = getChecklistState(memberId);
  return {
    ticks: saved?.ticks ?? [false, false, false, false, false],
    step: saved?.step ?? "form",
    mode: "closed", pipWindow: null,
    finishedFromChecklist: false,
    camsLink: { state: "preparing", error: null, url: null },
  };
}

export function supportsChecklist(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

function createStore(memberId: string) {
  let snapshot = initialState(memberId);
  const listeners = new Set<() => void>();
  let opening: Promise<"window" | "panel"> | null = null;
  let generation = 0;
  let removePagehide: (() => void) | null = null;
  let retryRequest: (() => void) | null = null;

  function update(next: Partial<ChecklistSnapshot>, persist = false) {
    snapshot = { ...snapshot, ...next };
    if (persist) setChecklistState(memberId, { ticks: snapshot.ticks, step: snapshot.step });
    listeners.forEach((listener) => listener());
  }

  function dismissWindow() {
    generation++;
    opening = null;
    try {
      removePagehide?.();
      removePagehide = null;
      if (snapshot.pipWindow && !snapshot.pipWindow.closed) snapshot.pipWindow.close();
    } catch {
      // A window may already be closing.
    }
  }

  function focus() {
    try {
      snapshot.pipWindow?.focus();
    } catch {
      dismissWindow();
      update({ mode: "panel", pipWindow: null });
    }
  }

  function finish() {
    dismissWindow();
    clearChecklistState(memberId);
    update({ ...initialState(memberId), step: "ready", finishedFromChecklist: true });
  }

  function onOpenerPagehide() {
    dismissWindow();
    update({ mode: "closed", pipWindow: null });
  }

  function open(): void {
    if (snapshot.mode === "window" && snapshot.pipWindow && !snapshot.pipWindow.closed) {
      focus();
      return;
    }
    if (opening) return;
    setChecklistState(memberId, { ticks: snapshot.ticks, step: snapshot.step });
    if (!supportsChecklist()) {
      update({ mode: "panel", pipWindow: null });
      return;
    }
    const attempt = ++generation;
    try {
      const pip = (window as unknown as {
        documentPictureInPicture: { requestWindow(options: { width: number; height: number }): Promise<ChecklistWindow> };
      }).documentPictureInPicture;
      const requested = pip.requestWindow({ width: 320, height: 440 });
      opening = Promise.resolve(requested).then((floating): "window" | "panel" => {
        if (attempt !== generation) {
          try { floating.close(); } catch { /* The stale window is already gone. */ }
          return "panel";
        }
        try {
          const target = floating.document;
          document.querySelectorAll('style, link[rel="stylesheet"]').forEach((style) => target.head.appendChild(style.cloneNode(true)));
          const light = target.createElement("style");
          light.textContent = ":root { color-scheme: light; } body { background: white; }";
          target.head.appendChild(light);
          target.documentElement.classList.remove("dark");
          target.documentElement.style.colorScheme = "light";
          target.title = checklistCopy.title;
          const onPagehide = () => {
            if (snapshot.step === "ready") {
              finish();
              return;
            }
            generation++;
            opening = null;
            removePagehide?.();
            removePagehide = null;
            update({ mode: "closed", pipWindow: null });
          };
          floating.addEventListener("pagehide", onPagehide);
          removePagehide = () => floating.removeEventListener("pagehide", onPagehide);
          update({ mode: "window", pipWindow: floating });
          return "window";
        } catch {
          try { floating.close(); } catch { /* Fall back in the tab. */ }
          update({ mode: "panel", pipWindow: null });
          return "panel";
        }
      }, (): "panel" => {
        if (attempt === generation) update({ mode: "panel", pipWindow: null });
        return "panel";
      }).then((mode) => {
        if (attempt === generation) opening = null;
        return mode;
      });
    } catch {
      opening = null;
      update({ mode: "panel", pipWindow: null });
    }
  }

  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("pagehide", onOpenerPagehide);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          if (typeof window !== "undefined") window.removeEventListener("pagehide", onOpenerPagehide);
          dismissWindow();
          retryRequest = null;
          snapshot = initialState(memberId);
        }
      };
    },
    refresh() {
      if (listeners.size === 0) snapshot = initialState(memberId);
    },
    open,
    reopen: open,
    focus,
    close() {
      if (snapshot.step === "ready") {
        finish();
        return;
      }
      dismissWindow();
      update({ mode: "closed", pipWindow: null });
    },
    toggle(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= 5) return;
      update({ ticks: snapshot.ticks.map((tick, i) => i === index ? !tick : tick) }, true);
    },
    setCamsLink(next: Partial<CamsLink>) {
      update({ camsLink: { ...snapshot.camsLink, ...next } });
    },
    markSubmitted() {
      if (snapshot.ticks.every(Boolean)) update({ step: "waiting" }, true);
    },
    markFileReady() {
      update({ step: "ready" }, true);
    },
    finish,
    clearFinishedFromChecklist() {
      if (snapshot.finishedFromChecklist) update({ finishedFromChecklist: false });
    },
    startOver() {
      dismissWindow();
      clearChecklistState(memberId);
      update(initialState(memberId));
    },
    settleOpening: () => opening ?? Promise.resolve(snapshot.mode),
    isOpening: () => opening !== null,
    setRetry(handler: (() => void) | null) { retryRequest = handler; },
    retry() { retryRequest?.(); },
  };
  return store;
}

const stores = new Map<string, ReturnType<typeof createStore>>();

export function getChecklistStore(memberId: string) {
  let store = stores.get(memberId);
  if (!store) {
    store = createStore(memberId);
    stores.set(memberId, store);
  }
  return store;
}
