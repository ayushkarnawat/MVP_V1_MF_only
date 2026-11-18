import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maskFolio, resetFolioVisibilityForTests, useFolioVisibility } from "./folioVisibility";

describe("maskFolio (Batch C 17c): XXXX + last four of the folio part + the sub-folio as printed", () => {
  it.each([
    ["10234567 / 0", "XXXX4567 / 0"],
    ["1234567/89", "XXXX4567/89"],
    ["10234567", "XXXX4567"],
    ["123", "XXXX123"],
    ["1234", "XXXX1234"],
    ["12345", "XXXX2345"],
    ["ABC12345", "XXXX2345"],
    ["KFN-00123 / 12", "XXXX0123 / 12"],
    ["", "XXXX"],
  ])("%s becomes %s", (folio, hiddenForm) => {
    expect(maskFolio(folio)).toBe(hiddenForm);
  });
  it("never changes what it does not hide: the sub-folio and its spacing", () => {
    expect(maskFolio("10234567  /  0").endsWith("  /  0")).toBe(true);
  });
});

describe("useFolioVisibility: one shared, remembered setting", () => {
  beforeEach(() => resetFolioVisibilityForTests());
  afterEach(() => {
    vi.restoreAllMocks();
    resetFolioVisibilityForTests();
  });

  it("starts shown", () => {
    const { result } = renderHook(() => useFolioVisibility());
    expect(result.current.hidden).toBe(false);
  });
  it("hidden state is shared by two components at once, and a toggle in one changes the other", () => {
    const a = renderHook(() => useFolioVisibility());
    const b = renderHook(() => useFolioVisibility());
    act(() => a.result.current.toggle());
    expect(a.result.current.hidden).toBe(true);
    expect(b.result.current.hidden).toBe(true);
    act(() => b.result.current.toggle());
    expect(a.result.current.hidden).toBe(false);
  });
  it("survives a remount and a page reload (it is saved in this browser)", () => {
    const first = renderHook(() => useFolioVisibility());
    act(() => first.result.current.toggle());
    first.unmount();
    expect(renderHook(() => useFolioVisibility()).result.current.hidden).toBe(true);
    act(() => resetFolioVisibilityForTests({ rereadStorage: true }));
    expect(renderHook(() => useFolioVisibility()).result.current.hidden).toBe(true);
  });
  it("showing again forgets the saved choice, so the default (shown) applies after a reload", () => {
    const { result } = renderHook(() => useFolioVisibility());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    act(() => resetFolioVisibilityForTests({ rereadStorage: true }));
    expect(renderHook(() => useFolioVisibility()).result.current.hidden).toBe(false);
  });
  it("is never saved on the account: only the browser's own storage is touched", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useFolioVisibility());
    act(() => result.current.toggle());
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("a storage failure leaves the numbers shown on load and still lets the toggle work for this page view", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    act(() => resetFolioVisibilityForTests({ rereadStorage: true }));
    const { result } = renderHook(() => useFolioVisibility());
    expect(result.current.hidden).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(true);
  });
});
