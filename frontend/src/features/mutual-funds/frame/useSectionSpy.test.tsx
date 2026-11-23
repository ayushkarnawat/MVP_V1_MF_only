import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageSection } from "../../../lib/pageSections";
import { useSectionSpy } from "./useSectionSpy";
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
let viewport: number;
const resizeObservers = new Set<ResizeDouble>();
const intersectionObservers = new Set<IntersectionDouble>();

class ResizeDouble {
  callback: ResizeObserverCallback;
  targets = new Set<Element>();
  constructor(callback: ResizeObserverCallback) { this.callback = callback; resizeObservers.add(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); resizeObservers.delete(this); }
}

class IntersectionDouble {
  callback: IntersectionObserverCallback;
  targets = new Set<Element>();
  root: Element | Document | null;
  rootMargin = "0px";
  thresholds = [0];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    intersectionObservers.add(this);
  }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); intersectionObservers.delete(this); }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) };
}

function notifyLayout() {
  for (const observer of resizeObservers) {
    const entries = [...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry));
    observer.callback(entries, observer as unknown as ResizeObserver);
  }
  for (const observer of intersectionObservers) {
    const bounds = root.getBoundingClientRect();
    const entries = [...observer.targets].map(target => {
      const box = target.getBoundingClientRect();
      const visible = Math.max(0, Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top));
      return { target, boundingClientRect: box, rootBounds: bounds, intersectionRect: rect(Math.max(box.top, bounds.top), visible),
        isIntersecting: visible > 0, intersectionRatio: box.height ? visible / box.height : 0, time: performance.now() };
    });
    observer.callback(entries, observer as unknown as IntersectionObserver);
  }
}

function scrollTo(top: number) {
  act(() => { root.scrollTop = top; fireEvent.scroll(root); notifyLayout(); });
}

beforeEach(() => {
  offsets = [24, 524, 1024];
  heights = [476, 476, 476];
  viewport = 500;
  root = document.createElement("main");
  root.style.overflowY = "auto";
  document.body.append(root);
  scrollRoot = { current: root };
  Object.defineProperties(root, {
    clientHeight: { configurable: true, get: () => viewport },
    scrollHeight: { configurable: true, get: () => offsets[2] + heights[2] + 24 },
    scrollTo: { configurable: true, value: (options: ScrollToOptions) => { root.scrollTop = options.top ?? 0; fireEvent.scroll(root); } },
  });
  vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => rect(100, viewport));
  for (const [index, section] of sections.entries()) {
    const element = document.createElement("section");
    element.id = section.anchor;
    element.style.scrollMarginTop = "24px";
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    element.append(heading);
    root.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect(100 + offsets[index] - root.scrollTop, heights[index]));
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(() => rect(100 + offsets[index] - root.scrollTop, 24));
    for (const target of [element, heading]) {
      vi.spyOn(target, "scrollIntoView").mockImplementation(options => {
        root.scrollTo({ top: offsets[index] - 24, behavior: typeof options === "object" ? options.behavior : "auto" });
      });
    }
  }
  vi.stubGlobal("ResizeObserver", ResizeDouble);
  vi.stubGlobal("IntersectionObserver", IntersectionDouble);
  window.history.replaceState(null, "", window.location.pathname);
});
afterEach(() => {
  cleanup(); root.remove(); resizeObservers.clear(); intersectionObservers.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("useSectionSpy", () => {
  it("spy marks the section nearest the top as the page area scrolls (a simulated scroll inside the container, not window)", async () => {
    const { result } = renderHook(() => useSectionSpy(scrollRoot, sections));
    scrollTo(0);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-asset-class"));
    scrollTo(500);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-market-cap"));
    scrollTo(0);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-asset-class"));
    expect(window.scrollY).toBe(0);
  });

  it("a section that grows after first paint keeps its place and a jump re-measures", async () => {
    const { result } = renderHook(() => ({ ...useSectionSpy(scrollRoot, sections), ...useSectionJump(scrollRoot, sections) }));
    scrollTo(500);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-market-cap"));
    act(() => { heights[1] += 400; offsets[2] += 400; notifyLayout(); });
    await waitFor(() => expect(result.current.activeId).toBe("allocation-market-cap"));
    act(() => { result.current.jumpTo("allocation-category-amc"); });
    await waitFor(() => expect(Math.abs(root.scrollTop - 1400)).toBeLessThanOrEqual(8));
    await waitFor(() => expect(result.current.activeId).toBe("allocation-category-amc"));
  });

  it("the last section becomes active on a short page even if it cannot reach the top", async () => {
    offsets = [24, 224, 424]; heights = [176, 176, 176]; viewport = 500;
    const { result } = renderHook(() => useSectionSpy(scrollRoot, sections));
    scrollTo(0);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-asset-class"));
    scrollTo(124);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-category-amc"));
    expect(root.querySelector("#allocation-category-amc")!.getBoundingClientRect().top).toBeGreaterThan(124);
  });

  it("two sections of similar height at the bottom of a short page", async () => {
    offsets = [24, 324, 624]; heights = [276, 276, 276]; viewport = 500;
    const { result } = renderHook(() => useSectionSpy(scrollRoot, sections));
    scrollTo(300);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-market-cap"));
    scrollTo(424);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-category-amc"));
    scrollTo(300);
    await waitFor(() => expect(result.current.activeId).toBe("allocation-market-cap"));
  });
});
