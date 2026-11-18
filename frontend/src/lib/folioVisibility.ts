import { useSyncExternalStore } from "react";

/**
 * Batch C item 17c: one remembered "hide folio numbers" setting for the whole app, and the one mask function.
 * Design: Docs/orchestration/2026-11-12-batch-c-planning-workbook.html, section 4 ("How the eye icon works").
 * The setting lives in this browser only (like the theme choice), never on the account; the default is shown.
 * Hiding only covers the screen: the full number is still in the page's data for the signed-in owner.
 */
const STORAGE_KEY = "unifolio.folioNumbersHidden";

/**
 * The hidden form: "XXXX" plus the last four characters of the folio part, then the sub-folio exactly as printed.
 * `10234567 / 0` gives `XXXX4567 / 0`; `1234567/89` gives `XXXX4567/89`. A folio part of four characters or fewer keeps
 * all of it after the XXXX (`123` gives `XXXX123`). Letters work the same way. Nothing is cleaned or reformatted.
 */
export function maskFolio(folio: string): string {
  const slash = folio.indexOf("/");
  const head = (slash === -1 ? folio : folio.slice(0, slash)).trimEnd();
  const tail = folio.slice(head.length);
  return `XXXX${head.slice(-4)}${tail}`;
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked or unavailable: numbers stay shown
  }
}

let hidden = readStored();
const listeners = new Set<() => void>();

function setHidden(next: boolean) {
  hidden = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* the choice still applies for this page view */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `hidden` is shared by every component that calls this; `toggle` flips it for all of them at once. */
export function useFolioVisibility(): { hidden: boolean; toggle: () => void } {
  const current = useSyncExternalStore(subscribe, () => hidden, () => false);
  return { hidden: current, toggle: () => setHidden(!hidden) };
}

/** For tests only: put the store back to "shown" (and forget the saved choice) or re-read the saved choice. */
export function resetFolioVisibilityForTests(options: { rereadStorage?: boolean } = {}) {
  if (options.rereadStorage) {
    hidden = readStored();
  } else {
    hidden = false;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((listener) => listener());
}
