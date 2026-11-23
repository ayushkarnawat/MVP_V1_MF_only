import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageSection } from "../../../lib/pageSections";
import { useSectionJump } from "./useSectionJump";

const sections: PageSection[] = [
  { id: "allocation-asset-class", anchor: "allocation-asset-class", title: "Look-Through Asset Allocation", tier: "standard" },
  { id: "allocation-market-cap", anchor: "allocation-market-cap", title: "Market-Cap Allocation", tier: "standard" },
  { id: "allocation-category-amc", anchor: "allocation-category-amc", title: "Portfolio Allocation", tier: "standard" },
];
let root: HTMLElement;
let scrollRoot: RefObject<HTMLElement | null>;
let offsets: number[];
let heights: number[];
let reducedMotion: boolean;
let scrollRequests: ScrollToOptions[];
const observers = new Set<ResizeDouble>();

class ResizeDouble {
  callback: ResizeObserverCallback;
  targets = new Set<Element>();
  constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.add(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
}

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) };
}

function notifyResize() {
  for (const observer of observers) {
    observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry)), observer as unknown as ResizeObserver);
  }
}

function expectNearTop(index: number) {
  const heading = root.querySelectorAll("h3")[index];
  const gap = heading.getBoundingClientRect().top - root.getBoundingClientRect().top;
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(gap).toBeLessThanOrEqual(32);
}

beforeEach(() => {
  offsets = [24, 624, 1224]; heights = [576, 576, 576]; reducedMotion = false; scrollRequests = [];
  root = document.createElement("main");
  root.style.overflowY = "auto";
  document.body.append(root);
  scrollRoot = { current: root };
  Object.defineProperties(root, {
    clientHeight: { configurable: true, value: 500 },
    scrollHeight: { configurable: true, get: () => offsets[2] + heights[2] + 24 },
    scrollTo: { configurable: true, value: (options: ScrollToOptions) => {
      scrollRequests.push(options);
      root.scrollTop = Math.max(0, Math.min(options.top ?? root.scrollTop, root.scrollHeight - root.clientHeight));
      fireEvent.scroll(root);
    } },
  });
  vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => rect(100, 500));
  for (const [index, section] of sections.entries()) {
    const element = document.createElement("section");
    element.id = section.anchor;
    element.style.scrollMarginTop = "24px";
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    element.append(heading);
    root.append(element);
    for (const target of [element, heading]) {
      vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => rect(100 + offsets[index] - root.scrollTop, target === heading ? 24 : heights[index]));
      vi.spyOn(target, "scrollIntoView").mockImplementation(options => {
        const behavior = typeof options === "object" ? options.behavior : "auto";
        root.scrollTo({ top: offsets[index] - 24, behavior });
      });
    }
  }
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal("ResizeObserver", ResizeDouble);
  window.history.replaceState(null, "", window.location.pathname);
});
afterEach(() => {
  cleanup(); root.remove(); observers.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("useSectionJump", () => {
  it("jump scrolls so the heading lands near the top, moves focus to the heading, writes the hash with replace", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { result } = renderHook(() => useSectionJump(scrollRoot, sections));
    act(() => { result.current.jumpTo("allocation-market-cap"); });
    await waitFor(() => expectNearTop(1));
    expect(root.querySelectorAll("h3")[1]).toHaveFocus();
    expect(window.location.hash).toBe("#allocation-market-cap");
    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(windowScroll).not.toHaveBeenCalled();
    expect(scrollRequests.some(request => request.behavior === "smooth")).toBe(true);
  });

  it("refresh on #allocation-market-cap returns to it", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}#allocation-market-cap`);
    const first = renderHook(() => useSectionJump(scrollRoot, sections));
    await waitFor(() => expectNearTop(1));
    first.unmount();
    root.scrollTop = 0;
    renderHook(() => useSectionJump(scrollRoot, sections));
    await waitFor(() => expectNearTop(1));
    expect(window.location.hash).toBe("#allocation-market-cap");
  });

  it("an unknown hash does nothing and does not crash", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}#missing-section`);
    const { result } = renderHook(() => useSectionJump(scrollRoot, sections));
    act(() => { result.current.jumpTo("missing-section"); notifyResize(); });
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(root.scrollTop).toBe(0);
    expect(scrollRequests).toEqual([]);
    expect(window.location.hash).toBe("#missing-section");
  });

  it("Back is not flooded by repeated jumps within a tab", async () => {
    const initialLength = window.history.length;
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useSectionJump(scrollRoot, sections));
    for (const id of ["allocation-market-cap", "allocation-category-amc", "allocation-asset-class"]) {
      act(() => { result.current.jumpTo(id); });
      await waitFor(() => expect(window.location.hash).toBe(`#${id}`));
    }
    expect(window.history.length).toBe(initialLength);
    expect(push).not.toHaveBeenCalled();
  });

  it("reduced motion gives an instant jump", async () => {
    reducedMotion = true;
    const { result } = renderHook(() => useSectionJump(scrollRoot, sections));
    act(() => { result.current.jumpTo("allocation-market-cap"); });
    await waitFor(() => expectNearTop(1));
    expect(scrollRequests.length).toBeGreaterThan(0);
    expect(scrollRequests.every(request => request.behavior !== "smooth")).toBe(true);
    expect(root.querySelectorAll("h3")[1]).toHaveFocus();
  });

  it("jump to a section whose content is still a skeleton then grows ends near the top after it settles", async () => {
    // Initial skeletons above the destination are short. Their growth moves its heading.
    offsets = [24, 224, 424]; heights = [176, 176, 900];
    root.querySelector("section")!.setAttribute("aria-busy", "true");
    const { result } = renderHook(() => useSectionJump(scrollRoot, sections));
    act(() => { result.current.jumpTo("allocation-market-cap"); });
    await waitFor(() => expectNearTop(1));
    act(() => {
      heights[0] += 400; heights[1] += 200; offsets[1] += 400; offsets[2] += 600;
      root.querySelector("section")!.setAttribute("aria-busy", "false");
      notifyResize();
    });
    await waitFor(() => expectNearTop(1), { timeout: 2000 });
    expect(root.querySelectorAll("h3")[1]).toHaveFocus();
    expect(window.location.hash).toBe("#allocation-market-cap");
  });
});
