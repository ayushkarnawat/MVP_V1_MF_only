import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PrintSettledContext } from "./usePrintSettled";

export function PrintReadyGate({ sectionIds, enabled, children }: { sectionIds: string[]; enabled: boolean; children: ReactNode }) {
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const timeoutRef = useRef<number | undefined>(undefined);
  const report = useCallback((id: string, ready: boolean) => {
    setSettled(previous => {
      if (previous.has(id) === ready) return previous;
      const next = new Set(previous);
      if (ready) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const allSettled = enabled && sectionIds.every(id => settled.has(id));

  useEffect(() => {
    const root = document.documentElement;
    delete root.dataset.printReady;
    delete root.dataset.printError;
    timeoutRef.current = window.setTimeout(() => {
      delete root.dataset.printReady;
      root.dataset.printError = "true";
    }, 60_000);
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    delete root.dataset.printReady;
    if (!allSettled) return;
    let active = true;
    let frame = 0;
    const cleanups: (() => void)[] = [];
    function waitForImage(image: HTMLImageElement): Promise<void> {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        const done = () => { remove(); resolve(); };
        const remove = () => { image.removeEventListener("load", done); image.removeEventListener("error", done); };
        image.addEventListener("load", done);
        image.addEventListener("error", done);
        cleanups.push(remove);
        if (image.complete) done();
      });
    }
    async function waitForAssets() {
      await document.fonts?.ready;
      if (!active) return;
      await Promise.all([...document.images].map(waitForImage));
      if (!active || root.dataset.printError) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!active || root.dataset.printError) return;
          if ([...document.images].some(image => !image.complete)) {
            void waitForAssets();
            return;
          }
          window.clearTimeout(timeoutRef.current);
          root.dataset.printReady = "true";
        });
      });
    }
    void waitForAssets().catch(() => {
      if (active) { delete root.dataset.printReady; root.dataset.printError = "true"; }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      for (const remove of cleanups) remove();
    };
  }, [allSettled, sectionIds]);

  return <PrintSettledContext.Provider value={report}>{children}</PrintSettledContext.Provider>;
}
