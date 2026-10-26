import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeSection } from "./useHomeSection";
import { useStaleWhileLoading } from "./useStaleWhileLoading";

const retry = () => {};
const loading = (): HomeSection<string> => ({ status: "loading", data: null, error: null, retry });
const data = (value: string): HomeSection<string> => ({ status: "data", data: value, error: null, retry });
const failed = (): HomeSection<string> => ({ status: "error", data: null, error: new Error("x"), retry });

function setup(initial: HomeSection<string>, key = "aggregate") {
  return renderHook(({ section, resetKey }) => useStaleWhileLoading(section, resetKey), {
    initialProps: { section: initial, resetKey: key },
  });
}

describe("useStaleWhileLoading", () => {
  it("passes the very first load through as loading", () => {
    const { result } = setup(loading());
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });

  it("passes data through", () => {
    const { result } = setup(data("one"));
    expect(result.current).toMatchObject({ status: "data", data: "one", refreshing: false });
  });

  it("keeps showing the last data, as data, while the next request is loading", () => {
    const { result, rerender } = setup(data("one"));
    rerender({ section: loading(), resetKey: "aggregate" });
    expect(result.current).toMatchObject({ status: "data", data: "one", refreshing: true });
    rerender({ section: data("two"), resetKey: "aggregate" });
    expect(result.current).toMatchObject({ status: "data", data: "two", refreshing: false });
  });

  it("forgets the kept data when the reset key changes (a scope change shows a skeleton)", () => {
    const { result, rerender } = setup(data("one"), "aggregate");
    rerender({ section: loading(), resetKey: "member:a" });
    expect(result.current).toMatchObject({ status: "loading", data: null, refreshing: false });
  });

  it("shows an error as an error and does not bring the old data back on the retry", () => {
    const { result, rerender } = setup(data("one"));
    rerender({ section: failed(), resetKey: "aggregate" });
    expect(result.current.status).toBe("error");
    expect(result.current.refreshing).toBe(false);
    rerender({ section: loading(), resetKey: "aggregate" });
    expect(result.current).toMatchObject({ status: "loading", data: null, refreshing: false });
  });

  it("keeps the retry function and the error of the section it wraps", () => {
    const section = failed();
    const { result } = setup(section);
    expect(result.current.retry).toBe(section.retry);
    expect(result.current.error).toBe(section.error);
  });
});
