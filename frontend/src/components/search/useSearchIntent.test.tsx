import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchIntent } from "./useSearchIntent";

const sectionId = "overview-sips";
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

function Probe({ onOpen }: { onOpen?: (open: string) => void }) {
  useSearchIntent({ onOpen });
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [renders, rerender] = useReducer((value: number) => value + 1, 0);
  return <>
    <output data-testid="state">{JSON.stringify(location.state)}</output>
    <output data-testid="address">{location.pathname + location.search + location.hash}</output>
    <output data-testid="navigation">{navigationType}</output>
    <button onClick={rerender}>Render {renders}</button>
    <button onClick={() => { void navigate(location.pathname, {
      state: { searchIntent: { open: "transactions" } },
    }); }}>Next intent</button>
  </>;
}

function mount(state?: unknown, onOpen?: (open: string) => void, showSection = true) {
  return render(<MemoryRouter initialEntries={[{
    pathname: "/funds", search: "?sort=name", hash: "#details", state,
  }]}>
    {showSection && <section id={sectionId}>SIPs</section>}
    <Probe onOpen={onOpen} />
  </MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers();
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: () => undefined });
  }
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...matchMedia(query), matches: false }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("useSearchIntent", () => {
  it("scrolls to the section, highlights it for 1.5 seconds and clears the intent", () => {
    mount({ searchIntent: { section: sectionId } });
    const section = document.getElementById(sectionId)!;
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(section);
    expect(section.getAttribute("data-search-highlight")).toBe("true");
    expect(JSON.parse(screen.getByTestId("state").textContent ?? "null") ?? {}).not.toHaveProperty("searchIntent");
    expect(screen.getByTestId("navigation").textContent).toBe("REPLACE");
    expect(screen.getByTestId("address").textContent).toBe("/funds?sort=name#details");
    act(() => { vi.advanceTimersByTime(1499); });
    expect(section.getAttribute("data-search-highlight")).toBe("true");
    act(() => { vi.advanceTimersByTime(1); });
    expect(section.hasAttribute("data-search-highlight")).toBe(false);
  });

  it("a section that appears late is found", async () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const view = mount({ searchIntent: { section: sectionId } }, undefined, false);
    expect(observe).toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4999); });
    await act(async () => {
      const section = document.createElement("section");
      section.id = sectionId;
      view.container.append(section);
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.getElementById(sectionId)?.getAttribute("data-search-highlight")).toBe("true");
    expect(disconnect).toHaveBeenCalled();
  });

  it("stops watching a missing section after five seconds", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const view = mount({ searchIntent: { section: sectionId } }, undefined, false);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(disconnect).toHaveBeenCalled();
    await act(async () => {
      const section = document.createElement("section");
      section.id = sectionId;
      view.container.append(section);
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.getElementById(sectionId)?.hasAttribute("data-search-highlight")).toBe(false);
  });

  it("open calls onOpen once", () => {
    const onOpen = vi.fn();
    mount({ searchIntent: { open: "sips" } }, onOpen);
    fireEvent.click(screen.getByRole("button", { name: "Render 0" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("sips");
    fireEvent.click(screen.getByRole("button", { name: "Next intent" }));
    expect(onOpen.mock.calls).toEqual([["sips"], ["transactions"]]);
    expect(JSON.parse(screen.getByTestId("state").textContent ?? "null") ?? {}).not.toHaveProperty("searchIntent");
  });

  it("reduced motion scrolls instantly", () => {
    vi.mocked(window.matchMedia).mockImplementation(query => ({
      matches: query === "(prefers-reduced-motion: reduce)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: () => false,
    }));
    mount({ searchIntent: { section: sectionId } });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "auto", block: "start" });
  });

  it("no intent does nothing", () => {
    const onOpen = vi.fn();
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    mount({ notice: "kept" }, onOpen);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(screen.getByTestId("navigation").textContent).toBe("POP");
    expect(JSON.parse(screen.getByTestId("state").textContent ?? "null")).toEqual({ notice: "kept" });
  });

  it("other router state keys are kept when the intent is cleared", () => {
    mount({ notice: "kept", nested: { value: 1 }, searchIntent: { section: sectionId } });
    expect(JSON.parse(screen.getByTestId("state").textContent ?? "null")).toEqual({
      notice: "kept", nested: { value: 1 },
    });
  });

  it("a second render of the same entry does not scroll again", () => {
    mount({ searchIntent: { section: sectionId } });
    fireEvent.click(screen.getByRole("button", { name: "Render 0" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.getElementById(sectionId)?.getAttribute("data-search-highlight")).toBe("true");
  });

  it("the highlight and the observer are removed on unmount", async () => {
    const highlighted = mount({ searchIntent: { section: sectionId } });
    const section = document.getElementById(sectionId)!;
    expect(section.hasAttribute("data-search-highlight")).toBe(true);
    highlighted.unmount();
    expect(section.hasAttribute("data-search-highlight")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const waiting = mount({ searchIntent: { section: sectionId } }, undefined, false);
    expect(observe).toHaveBeenCalled();
    waiting.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      const late = document.createElement("section");
      late.id = sectionId;
      waiting.container.append(late);
      vi.advanceTimersByTime(5000);
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("it never calls window.history.replaceState or pushState", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    mount({ searchIntent: { section: sectionId, open: "sips" } }, vi.fn());
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("navigation").textContent).toBe("REPLACE");
  });
});
