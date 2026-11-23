import { useEffect, useState, type RefObject } from "react";
import type { PageSection } from "../../../lib/pageSections";

export function useRenderedSections(
  scrollRoot: RefObject<HTMLElement | null>,
  sections: PageSection[],
): PageSection[] {
  const [rendered, setRendered] = useState<PageSection[]>([]);

  useEffect(() => {
    const root = scrollRoot.current;
    const update = () => {
      const next = sections.filter(section => {
        const element = document.getElementById(section.anchor);
        return element !== null && root?.contains(element);
      });
      setRendered(previous => previous.length === next.length
        && previous.every((section, index) => section === next[index]) ? previous : next);
    };
    update();
    if (!root) return;
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scrollRoot, sections]);

  return rendered;
}
