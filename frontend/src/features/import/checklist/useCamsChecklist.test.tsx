import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCamsChecklist } from "./useCamsChecklist";
import { getChecklistState, setChecklistState, clearChecklistState, setCasResumeStep2, hasCasResumeStep2 } from "../casResumeState";

// The floating window's document must have a window (testing-library needs one to compute roles and styles), so it is the
// document of a hidden iframe, not a bare document made with createHTMLDocument.
function floatingDocument(): Document {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  document.body.append(frame);
  const doc = frame.contentDocument as Document;
  doc.title = "Unifolio checklist";
  return doc;
}


function floatingWindow() {
  const events = new EventTarget();
  const floating = {
    document: floatingDocument(),
    closed: false,
    focus: vi.fn(),
    close: vi.fn(() => {
      floating.closed = true;
      events.dispatchEvent(new Event("pagehide"));
    }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return floating;
}

describe("useCamsChecklist", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("open calls requestWindow synchronously with 320 by 440 and returns void", async () => {
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { result } = renderHook(() => useCamsChecklist("member-h8"));
    expect(result.current.supported).toBe(true);
    expect(result.current.mode).toBe("closed");
    act(() => {
      expect(result.current.open()).toBeUndefined();
      expect(requestWindow).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 440 });
    });
    await waitFor(() => expect(result.current.mode).toBe("window"));
  });

  it("no support opens the in-page panel", () => {
    Reflect.deleteProperty(window, "documentPictureInPicture");
    const { result } = renderHook(() => useCamsChecklist("member-h8"));
    expect(result.current.supported).toBe(false);
    act(() => result.current.open());
    expect(result.current.mode).toBe("panel");
  });

  it.each(["throws", "rejects"])("requestWindow %s NotAllowedError: open swallows the error into panel mode", async (failure) => {
    const error = new DOMException("Not allowed", "NotAllowedError");
    const requestWindow = vi.fn(() => {
      if (failure === "throws") throw error;
      return Promise.reject(error);
    });
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { result } = renderHook(() => useCamsChecklist("member-h8"));
    act(() => expect(() => result.current.open()).not.toThrow());
    await waitFor(() => expect(result.current.mode).toBe("panel"));
  });

  it("a second press while open focuses the existing window instead of opening another", async () => {
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { result } = renderHook(() => useCamsChecklist("member-h8"));
    act(() => result.current.open());
    await waitFor(() => expect(result.current.mode).toBe("window"));
    act(() => result.current.open());
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(floating.focus).toHaveBeenCalledTimes(1);
  });

  it("steps move form to waiting to ready, keep the window open, and finish clears saved state", async () => {
    setCasResumeStep2("member-h8");
    const { result, unmount } = renderHook(() => useCamsChecklist("member-h8"));
    expect(result.current.step).toBe("form");
    expect(result.current.ticks).toEqual([false, false, false, false, false]);
    act(() => result.current.setCamsLink({ state: "idle", error: null }));
    for (let i = 0; i < 5; i++) act(() => result.current.toggle(i));
    act(() => result.current.markSubmitted());
    expect(result.current.step).toBe("waiting");
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "waiting" });
    const stored = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) ?? ""));
    expect(stored.filter((value) => value !== "true").map((value) => JSON.parse(value ?? "null"))).toEqual([
      { ticks: [true, true, true, true, true], step: "waiting" },
    ]);
    expect(hasCasResumeStep2("member-h8")).toBe(true);
    unmount();
    const restored = renderHook(() => useCamsChecklist("member-h8"));
    expect(restored.result.current.mode).toBe("closed");
    expect(restored.result.current.step).toBe("waiting");
    expect(restored.result.current.ticks).toEqual([true, true, true, true, true]);
    const floating = floatingWindow();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockResolvedValue(floating) });
    act(() => restored.result.current.open());
    await waitFor(() => expect(restored.result.current.mode).toBe("window"));
    act(() => restored.result.current.markFileReady());
    expect(restored.result.current.step).toBe("ready");
    expect(restored.result.current.mode).toBe("window");
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "ready" });
    expect(floating.close).not.toHaveBeenCalled();
    expect(restored.result.current.finishedFromChecklist).toBe(false);
    act(() => restored.result.current.finish());
    expect(restored.result.current.mode).toBe("closed");
    expect(restored.result.current.finishedFromChecklist).toBe(true);
    expect(getChecklistState("member-h8")).toBeNull();
    expect(floating.close).toHaveBeenCalledTimes(1);
  });

  it("opener pagehide preserves ready for reload instead of finishing the checklist", async () => {
    setChecklistState("member-h9b", { ticks: [true, true, true, true, true], step: "ready" });
    const floating = floatingWindow();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockResolvedValue(floating) });
    const { result } = renderHook(() => useCamsChecklist("member-h9b"));
    act(() => result.current.reopen());
    await waitFor(() => expect(result.current.mode).toBe("window"));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(result.current.mode).toBe("closed");
    expect(result.current.finishedFromChecklist).toBe(false);
    expect(getChecklistState("member-h9b")).toEqual({ ticks: [true, true, true, true, true], step: "ready" });
  });

  it("storage holds only ticks and step, clear preserves the separate resume marker", () => {
    setCasResumeStep2("member-h8");
    setChecklistState("member-h8", { ticks: [true, false, false, false, false], step: "form" });
    const stored = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) ?? ""));
    expect(stored.filter((value) => value !== "true").map((value) => JSON.parse(value ?? "null"))).toEqual([
      { ticks: [true, false, false, false, false], step: "form" },
    ]);
    clearChecklistState("member-h8");
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) ?? ""))).toEqual(["true", "true"]);
    expect(hasCasResumeStep2("member-h8")).toBe(true);
  });

  it("the next family member starts at step 1 with no ticks", () => {
    setChecklistState("member-h8", { ticks: [true, true, true, true, true], step: "waiting" });
    const { result, rerender } = renderHook(({ memberId }) => useCamsChecklist(memberId), { initialProps: { memberId: "member-h8" } });
    expect(result.current.step).toBe("waiting");
    rerender({ memberId: "member-h8-next" });
    expect(result.current.step).toBe("form");
    expect(result.current.ticks).toEqual([false, false, false, false, false]);
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "waiting" });
  });

  it("pagehide closes the mode; reopen needs a call and startOver resets ticks and step", async () => {
    const first = floatingWindow();
    const second = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { result } = renderHook(() => useCamsChecklist("member-h8"));
    act(() => result.current.open());
    await waitFor(() => expect(result.current.mode).toBe("window"));
    act(() => result.current.toggle(0));
    act(() => first.close());
    expect(result.current.mode).toBe("closed");
    expect(requestWindow).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.reopen();
      expect(requestWindow).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => expect(result.current.mode).toBe("window"));
    act(() => result.current.startOver());
    expect(result.current.step).toBe("form");
    expect(result.current.ticks).toEqual([false, false, false, false, false]);
  });

  it("copies styles into the floating window and forces a light colour scheme", async () => {
    const style = document.createElement("style");
    style.textContent = ":root { --h8-test: 1; }";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/h8-test.css";
    document.head.append(style, link);
    const floating = floatingWindow();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockResolvedValue(floating) });
    try {
      const { result } = renderHook(() => useCamsChecklist("member-h8"));
      act(() => result.current.open());
      await waitFor(() => expect(result.current.mode).toBe("window"));
      expect(floating.document.head.textContent).toContain("--h8-test");
      expect(floating.document.querySelector('link[rel="stylesheet"][href="/h8-test.css"]')).not.toBeNull();
      const rules = floating.document.documentElement.getAttribute("style") + " " + floating.document.head.textContent;
      expect(rules).toMatch(/color-scheme\s*:\s*light/);
    } finally {
      style.remove();
      link.remove();
    }
  });
});
