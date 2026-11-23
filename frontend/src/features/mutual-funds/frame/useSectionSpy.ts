import { useEffect, useState, type RefObject } from "react";
import type { PageSection } from "../../../lib/pageSections";

export function useSectionSpy(
  scrollRoot: RefObject<HTMLElement | null>,
  sections: PageSection[],
): { activeId: string | null } {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) {
      setActiveId(null);
      return;
    }
    const measure = () => {
      const present = sections.flatMap(section => {
        const element = document.getElementById(section.anchor);
        return element && root.contains(element) ? [{ section, element }] : [];
      });
      let active: string | null = null;
      let nearest = Infinity;
      const top = root.getBoundingClientRect().top + root.clientTop;
      for (const { section, element } of present) {
        const margin = Number.parseInt(getComputedStyle(element).scrollMarginTop, 10) || 24;
        const distance = Math.abs(element.getBoundingClientRect().top - top - margin);
        if (distance < nearest) {
          nearest = distance;
          active = section.id;
        }
      }
      if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
        active = present.at(-1)?.section.id ?? null;
      }
      setActiveId(active);
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(root);
      for (const child of root.children) resize.observe(child);
      for (const section of sections) {
        const element = document.getElementById(section.anchor);
        if (element && root.contains(element)) resize.observe(element);
      }
      measure();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", measure, { passive: true });
    observe();
    return () => {
      root.removeEventListener("scroll", measure);
      mutation.disconnect();
      resize.disconnect();
    };
  }, [scrollRoot, sections]);

  return { activeId };
}
