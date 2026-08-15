import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOAuthScript, loadedScripts } from "./useOAuthScript";

describe("useOAuthScript", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    loadedScripts.clear();
  });

  it("starts in the loading state", () => {
    const { result } = renderHook(() => useOAuthScript("https://example.com/script.js"));
    expect(result.current).toBe("loading");
  });

  it("resolves to loaded when the script fires onload", async () => {
    const { result } = renderHook(() => useOAuthScript("https://example.com/script.js"));
    const script = document.head.querySelector("script")!;

    act(() => {
      script.onload?.(new Event("load"));
    });

    await waitFor(() => expect(result.current).toBe("loaded"));
  });

  it("resolves to error when the script fails to load", async () => {
    const { result } = renderHook(() => useOAuthScript("https://example.com/bad.js"));
    const script = document.head.querySelector("script")!;

    act(() => {
      script.onerror?.(new Event("error"));
    });

    await waitFor(() => expect(result.current).toBe("error"));
  });

  it("only injects one script tag even when used from two components at once", () => {
    renderHook(() => useOAuthScript("https://example.com/shared.js"));
    renderHook(() => useOAuthScript("https://example.com/shared.js"));

    const scripts = document.head.querySelectorAll('script[src="https://example.com/shared.js"]');
    expect(scripts).toHaveLength(1);
  });
});
