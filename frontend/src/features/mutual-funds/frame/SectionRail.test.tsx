import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sectionsForTab, type PageSection } from "../../../lib/pageSections";
import { SectionRail } from "./SectionRail";

const sections: PageSection[] = [
  { id: "performance-returns", anchor: "performance-returns", title: "Returns", tier: "standard" },
  { id: "performance-portfolio-history", anchor: "performance-portfolio-history", title: "Portfolio History", tier: "standard" },
  { id: "performance-benchmark-comparison", anchor: "performance-benchmark-comparison", title: "Benchmark Comparison (XIRR)", tier: "standard" },
];
let width: number;
let reducedMotion: boolean;

// F-7 styling contract for jsdom (CSS geometry/media rules need browser QA):
// nav[data-state="closed"|"open"], [data-section-tick] per item,
// nav[data-layout="rail"|"pill"], nav[data-motion="reduced"],
// nav[data-backdrop="fallback"] selects the near-solid @supports fallback.
// The fallback selector must be styled inside @supports not (backdrop-filter: blur(1px)).
beforeEach(() => {
  width = 1280; reducedMotion = false;
  vi.spyOn(window, "matchMedia").mockImplementation(query => {
    const min = query.match(/min-width:\s*([\d.]+)px/);
    const max = query.match(/max-width:\s*([\d.]+)px/);
    return {
      matches: query.includes("prefers-reduced-motion") ? reducedMotion
        : min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false,
      media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    };
  });
  vi.stubGlobal("innerWidth", width);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(list = sections, activeId: string | null = sections[0].id) {
  vi.stubGlobal("innerWidth", width);
  const onJump = vi.fn();
  const view = render(<SectionRail sections={list} activeId={activeId} onJump={onJump} />);
  return { ...view, onJump };
}
function nav() { return screen.getByRole("navigation", { name: "On this page" }); }
function open() { fireEvent.mouseEnter(nav()); }

describe("SectionRail", () => {
  it("shows on tabs with three or more rendered sections and not on holdings or transactions", () => {
    for (const tab of ["overview", "performance", "allocation", "overlap", "analytics", "holdings", "transactions"] as const) {
      const view = mount(sectionsForTab(tab));
      if (tab === "holdings" || tab === "transactions") {
        expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
      } else {
        expect(nav()).toBeInTheDocument();
      }
      view.unmount();
    }
    const view = mount(sections.slice(0, 2));
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
    view.rerender(<SectionRail sections={sections} activeId={null} onJump={view.onJump} />);
    expect(nav()).toBeInTheDocument();
  });

  it("it is a labelled navigation region, items are links, aria-current marks the active one", () => {
    const { onJump } = mount(sections, "performance-portfolio-history");
    open();
    const links = within(nav()).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.map(link => link.getAttribute("href"))).toEqual([
      "#performance-returns", "#performance-portfolio-history", "#performance-benchmark-comparison",
    ]);
    expect(links[1].getAttribute("aria-current")).toBeTruthy();
    expect(links[1].getAttribute("aria-current")).not.toBe("false");
    expect(links.filter(link => link.hasAttribute("aria-current") && link.getAttribute("aria-current") !== "false")).toEqual([links[1]]);
    fireEvent.click(links[1]);
    expect(onJump).toHaveBeenCalledWith("performance-portfolio-history");
  });

  it("closed: a slim strip of ticks; hover, focus or click opens the list of names", () => {
    const first = mount();
    expect(nav()).toHaveAttribute("data-state", "closed");
    expect(nav().querySelectorAll("[data-section-tick]")).toHaveLength(3);
    open();
    expect(nav()).toHaveAttribute("data-state", "open");
    expect(within(nav()).getByRole("link", { name: "Portfolio History" })).toBeInTheDocument();
    fireEvent.mouseLeave(nav());
    expect(nav()).toHaveAttribute("data-state", "closed");
    first.unmount();

    const second = mount();
    act(() => { within(nav()).getAllByRole("link")[0].focus(); });
    expect(nav()).toHaveAttribute("data-state", "open");
    second.unmount();

    mount();
    fireEvent.click(nav());
    expect(nav()).toHaveAttribute("data-state", "open");
  });

  it("Pin keeps it open", () => {
    mount(); open();
    fireEvent.click(within(nav()).getByRole("button", { name: "Pin" }));
    fireEvent.mouseLeave(nav());
    expect(nav()).toHaveAttribute("data-state", "open");
    const pin = within(nav()).getByRole("button", { name: /unpin/i });
    fireEvent.click(pin);
    act(() => { pin.blur(); });
    fireEvent.mouseLeave(nav());
    expect(nav()).toHaveAttribute("data-state", "closed");
  });

  it("Escape closes the open rail and returns focus", () => {
    mount();
    const entry = within(nav()).getAllByRole("link")[0];
    act(() => { entry.focus(); });
    expect(nav()).toHaveAttribute("data-state", "open");
    act(() => { within(nav()).getAllByRole("link")[1].focus(); });
    fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
    expect(nav()).toHaveAttribute("data-state", "closed");
    expect(entry).toHaveFocus();
  });

  it('below 1100 px it renders the corner pill "On this page"', () => {
    width = 1099;
    const view = mount();
    expect(nav()).toHaveAttribute("data-layout", "pill");
    const trigger = within(nav()).getByRole("button", { name: "On this page" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(nav()).getByRole("link", { name: "Returns" })).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    view.unmount();
    width = 1100;
    mount();
    expect(nav()).toHaveAttribute("data-layout", "rail");
  });

  it("reduced motion: no animation", () => {
    reducedMotion = true;
    mount(); open();
    expect(nav()).toHaveAttribute("data-motion", "reduced");
    // Browser QA must confirm this hook removes transitions on the rail and its descendants.
  });

  it("where backdrop-filter is unsupported a near-solid fallback class is used", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    mount();
    expect(nav()).toHaveAttribute("data-backdrop", "fallback");
    // This hook is the stylesheet's @supports fallback selector, not a claim about jsdom blur rendering.
  });

  it("an empty tab shows no rail", () => {
    mount([], null);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("Overlap names omit the literal card numbering", () => {
    mount(sectionsForTab("overlap")); open();
    for (const title of ["Common Holdings", "Overlap Heatmap", "Top Overlapping Fund Pairs", "Overlap Impact"]) {
      expect(within(nav()).getByRole("link", { name: title })).toBeInTheDocument();
    }
  });
});
