import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { PageSection } from "../../../lib/pageSections";

export function useSectionJump(
  scrollRoot: RefObject<HTMLElement | null>,
  sections: PageSection[],
): { jumpTo: (id: string) => void } {
  const jump = useRef<(id: string) => void>(() => {});
  const jumpTo = useCallback((id: string) => jump.current(id), []);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    let target: HTMLElement | null = null;
    let heading: HTMLElement | null = null;
    let correction: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const stop = () => {
      target = null;
      heading = null;
      clearTimeout(correction);
      cancelAnimationFrame(frame);
    };
    const align = (behavior: ScrollBehavior) => {
      if (!target || !heading || !root.contains(target)) return;
      const margin = Number.parseInt(getComputedStyle(target).scrollMarginTop, 10) || 24;
      const top = Math.max(0, root.scrollTop + heading.getBoundingClientRect().top
        - root.getBoundingClientRect().top - root.clientTop - margin);
      const destination = Math.min(top, Math.max(0, root.scrollHeight - root.clientHeight));
      if (Math.abs(root.scrollTop - destination) > 1) root.scrollTo({ top: destination, behavior });
      root.dispatchEvent(new Event("scroll"));
    };
    const settle = (delay = 500) => {
      if (!target) return;
      clearTimeout(correction);
      correction = setTimeout(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => align("instant"));
      }, delay);
    };
    const resize = new ResizeObserver(() => settle());
    const observe = () => {
      resize.disconnect();
      resize.observe(root);
      for (const child of root.children) resize.observe(child);
      for (const section of sections) {
        const element = document.getElementById(section.anchor);
        if (element && root.contains(element)) resize.observe(element);
      }
      settle();
    };
    const perform = (id: string) => {
      const section = sections.find(entry => entry.id === id);
      const element = section ? document.getElementById(section.anchor) : null;
      if (!section || !element || !root.contains(element)) return;
      stop();
      target = element;
      heading = element.matches("h1, h2, h3, h4, h5, h6")
        ? element : element.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
      heading ??= element;
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      align(reduced ? "instant" : "smooth");
      window.history.replaceState(window.history.state, "", `#${section.anchor}`);
      settle(reduced ? 0 : 500);
    };
    jump.current = perform;
    const mutation = new MutationObserver(observe);
    mutation.observe(root, { childList: true, subtree: true });
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"].includes(event.key)) stop();
    };
    root.addEventListener("wheel", stop, { passive: true });
    root.addEventListener("touchstart", stop, { passive: true });
    root.addEventListener("pointerdown", stop, { passive: true });
    root.addEventListener("keydown", onKey);
    observe();
    const initial = sections.find(section => `#${section.anchor}` === window.location.hash);
    if (initial) perform(initial.id);
    return () => {
      stop();
      jump.current = () => {};
      mutation.disconnect();
      resize.disconnect();
      root.removeEventListener("wheel", stop);
      root.removeEventListener("touchstart", stop);
      root.removeEventListener("pointerdown", stop);
      root.removeEventListener("keydown", onKey);
    };
  }, [scrollRoot, sections]);

  return { jumpTo };
}
