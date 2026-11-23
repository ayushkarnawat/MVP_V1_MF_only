import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sectionsForTab, type MfTabId } from "../../../lib/pageSections";
import { useScope } from "../../../shell/scope/ScopeContext";
import { renderInShell } from "../../../shell/testing";
import { MutualFundsFrame, useMfFrame } from "./MutualFundsFrame";

const intersections = new Set<IntersectionDouble>();
class IntersectionDouble {
  callback: IntersectionObserverCallback;
  root: Element | Document | null;
  rootMargin = "0px";
  thresholds = [0];
  targets = new Set<Element>();
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback; this.root = options?.root ?? null; intersections.add(this);
  }
  observe(target: Element) { this.targets.add(target); queueMicrotask(() => this.emit()); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); intersections.delete(this); }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  emit() {
    const bounds = document.querySelector("main")?.getBoundingClientRect() ?? rect(100, 500);
    this.callback([...this.targets].map(target => {
      const box = target.getBoundingClientRect();
      const height = Math.max(0, Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top));
      return { target, time: performance.now(), rootBounds: bounds, boundingClientRect: box,
        intersectionRect: rect(Math.max(box.top, bounds.top), height), isIntersecting: height > 0,
        intersectionRatio: box.height ? height / box.height : 0 };
    }), this as unknown as IntersectionObserver);
  }
}
function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) };
}
function configureRoot(main: HTMLElement | null) {
  if (!main) return;
  Object.defineProperties(main, {
    clientHeight: { configurable: true, value: 500 },
    scrollHeight: { configurable: true, value: 3000 },
    scrollTo: { configurable: true, value: (options: ScrollToOptions) => {
      main.scrollTop = options.top ?? 0;
      fireEvent.scroll(main);
      for (const observer of intersections) observer.emit();
    } },
  });
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionDouble);
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: /min-width/.test(query), media: query, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const section = this.closest<HTMLElement>("[data-test-section-position]");
    const main = this.closest("main");
    if (section && main) return rect(124 + Number(section.dataset.testSectionPosition) * 600 - main.scrollTop, this.matches("h3") ? 24 : 576);
    return rect(100, 500);
  });
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, options) {
    const section = this.closest<HTMLElement>("[data-test-section-position]");
    section?.closest("main")?.scrollTo({ top: Number(section.dataset.testSectionPosition) * 600,
      behavior: typeof options === "object" ? options.behavior : "auto" });
  });
  window.history.replaceState(null, "", window.location.pathname);
});
afterEach(() => {
  cleanup(); intersections.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

function Anchors({ tab, count, state = "ready" }: { tab: MfTabId; count: number; state?: "ready" | "empty" | "failed" }) {
  return <>{sectionsForTab(tab).slice(0, count).map((section, index) => (
    <section key={section.id} id={section.anchor} data-test-section-position={index} style={{ scrollMarginTop: "24px" }}>
      <h3>{section.title}</h3>
      {state === "failed" ? <p role="alert">This section failed to load.</p> : <p>{state === "empty" ? "No data yet" : "Invented sample content"}</p>}
    </section>
  ))}</>;
}
function Page({ tab, count, state }: { tab: MfTabId; count: number; state?: "ready" | "empty" | "failed" }) {
  return <main ref={configureRoot} className="min-h-0 flex-1 overflow-y-auto p-6">
    <MutualFundsFrame tab={tab}><Anchors tab={tab} count={count} state={state} /></MutualFundsFrame>
  </main>;
}
function rail() { return screen.getByRole("navigation", { name: "On this page" }); }
function mount(tab: MfTabId, count: number, state?: "ready" | "empty" | "failed") {
  return renderInShell(<Page tab={tab} count={count} state={state} />, {
    path: "/portfolio/mutual-funds/performance",
    scope: { members: [{ id: "member-a", name: "Sample A" }, { id: "member-b", name: "Sample B" }] },
  });
}

describe("MutualFundsFrame section rail", () => {
  it("the frame exposes scrollRoot through useMfFrame", async () => {
    let exposed: RefObject<HTMLElement | null> | undefined;
    function Probe() {
      const { scrollRoot } = useMfFrame();
      useEffect(() => { exposed = scrollRoot; }, [scrollRoot]);
      return <p>Frame child</p>;
    }
    renderInShell(<main ref={configureRoot}><MutualFundsFrame tab="performance"><Probe /></MutualFundsFrame></main>);
    await waitFor(() => expect(exposed?.current).toBe(screen.getByRole("main")));
    expect(exposed?.current).toBeInstanceOf(HTMLElement);
  });

  it("the frame mounts the rail only when three or more sections are rendered", async () => {
    const view = mount("allocation", 2);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
    view.rerender(<Page tab="allocation" count={3} />);
    await waitFor(() => expect(rail()).toBeInTheDocument());
    expect(within(rail()).getAllByRole("link")).toHaveLength(3);
    view.rerender(<Page tab="allocation" count={2} />);
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument());
  });

  it("the tab bar does not stick", () => {
    mount("performance", 3);
    const tabs = screen.getByRole("navigation", { name: "Mutual Funds sections" });
    for (let element: HTMLElement | null = tabs; element && element.tagName !== "MAIN"; element = element.parentElement) {
      expect(element.className).not.toMatch(/(?:^|\s|:)sticky(?:\s|$)/);
      expect(element.style.position).not.toBe("sticky");
    }
  });

  it("an empty tab shows no rail", () => {
    // Overlap's fewer-than-two-funds state has no anchored cards despite four configured entries.
    mount("overlap", 0);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("a section that is empty or failed still appears in the index", async () => {
    const view = mount("performance", 3, "empty");
    await waitFor(() => expect(rail()).toBeInTheDocument());
    expect(within(rail()).getAllByRole("link")).toHaveLength(3);
    view.rerender(<Page tab="performance" count={3} state="failed" />);
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(3));
    expect(within(rail()).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      "#performance-returns", "#performance-portfolio-history", "#performance-benchmark-comparison",
    ]);
  });

  it("a family-selector change that reloads data keeps the list and the highlight", async () => {
    function ReloadingBody() {
      const { setMember, memberId } = useScope();
      const [loading, setLoading] = useState(false);
      return <>
        <button onClick={() => { setMember("member-b"); setLoading(true); }}>Select Sample B</button>
        <button onClick={() => setLoading(false)}>Finish sample reload</button>
        <output aria-label="Selected sample">{memberId}</output>
        {sectionsForTab("performance").map((section, index) => <section key={section.id} id={section.anchor}
          data-test-section-position={index} style={{ scrollMarginTop: "24px" }}>
          <h3>{section.title}</h3>
          {loading ? <div role="status">Loading sample</div> : <p>Ready sample</p>}
        </section>)}
      </>;
    }
    renderInShell(<main ref={configureRoot}><MutualFundsFrame tab="performance"><ReloadingBody /></MutualFundsFrame></main>, {
      scope: { members: [{ id: "member-a", name: "Sample A" }, { id: "member-b", name: "Sample B" }] },
    });
    await waitFor(() => expect(rail()).toBeInTheDocument());
    fireEvent.mouseEnter(rail());
    fireEvent.click(within(rail()).getByRole("link", { name: "Portfolio History" }));
    const expectHistoryActive = () => {
      const current = within(rail()).getByRole("link", { name: "Portfolio History" }).getAttribute("aria-current");
      expect(current).toBeTruthy(); expect(current).not.toBe("false");
    };
    await waitFor(expectHistoryActive);
    const hrefs = within(rail()).getAllByRole("link").map(link => link.getAttribute("href"));
    fireEvent.click(screen.getByRole("button", { name: "Select Sample B" }));
    expect(screen.getByLabelText("Selected sample")).toHaveTextContent("member-b");
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(within(rail()).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(hrefs);
    expectHistoryActive();
    fireEvent.click(screen.getByRole("button", { name: "Finish sample reload" }));
    await waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0));
    expectHistoryActive();
  });

  it("Tab into the rail, Enter jumps and moves focus to the heading, Escape closes and returns focus", async () => {
    mount("performance", 3);
    await waitFor(() => expect(rail()).toBeInTheDocument());
    const entry = within(rail()).getByRole("link", { name: "Returns" });
    expect(entry.tabIndex).toBeGreaterThanOrEqual(0);
    // fireEvent has no native Tab traversal or Enter default activation in jsdom.
    // Place focus at the Tab destination, then dispatch the keyboard click a browser generates.
    fireEvent.keyDown(document.body, { key: "Tab", code: "Tab" });
    act(() => { entry.focus(); });
    expect(entry).toHaveFocus();
    expect(rail()).toHaveAttribute("data-state", "open");
    const destination = within(rail()).getByRole("link", { name: "Portfolio History" });
    act(() => { destination.focus(); });
    fireEvent.keyDown(destination, { key: "Enter", code: "Enter" });
    fireEvent.click(destination, { detail: 0 });
    fireEvent.keyUp(destination, { key: "Enter", code: "Enter" });
    const heading = screen.getByRole("heading", { name: "Portfolio History" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(window.location.hash).toBe("#performance-portfolio-history");
    // Re-enter the rail to exercise Escape while it owns focus.
    act(() => { entry.focus(); });
    act(() => { destination.focus(); });
    fireEvent.keyDown(destination, { key: "Escape", code: "Escape" });
    expect(rail()).toHaveAttribute("data-state", "closed");
    expect(entry).toHaveFocus();
  });
});
