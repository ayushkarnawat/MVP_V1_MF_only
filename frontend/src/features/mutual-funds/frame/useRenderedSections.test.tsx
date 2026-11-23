import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PageSection } from "../../../lib/pageSections";
import { useRenderedSections } from "./useRenderedSections";

const sections: PageSection[] = [
  { id: "overview-value-over-time", anchor: "overview-value-over-time", title: "Value over time", tier: "standard" },
  { id: "overview-sips", anchor: "overview-sips", title: "SIPs", tier: "standard" },
  { id: "overview-mutual-funds", anchor: "overview-mutual-funds", title: "Mutual Funds", tier: "standard" },
];
let root: HTMLElement;
let scrollRoot: RefObject<HTMLElement | null>;

function append(id: string, text = "Ready") {
  const section = document.createElement("section");
  section.id = id;
  section.textContent = text;
  root.append(section);
  return section;
}

beforeEach(() => {
  root = document.createElement("main");
  document.body.append(root);
  scrollRoot = { current: root };
});
afterEach(() => { cleanup(); root.remove(); });

describe("useRenderedSections", () => {
  it("a section missing from the DOM is not in the rendered list", async () => {
    // An anchor elsewhere in the document must not count as part of this page.
    const outside = document.createElement("section");
    outside.id = "overview-value-over-time";
    document.body.append(outside);
    try {
      append("overview-mutual-funds");
      append("overview-sips");
      const { result } = renderHook(() => useRenderedSections(scrollRoot, sections));
      await waitFor(() => expect(result.current).toEqual([sections[1], sections[2]]));
    } finally { outside.remove(); }
  });

  it("the list updates when a section appears later (a lazy graph)", async () => {
    append("overview-sips");
    append("overview-mutual-funds");
    const { result } = renderHook(() => useRenderedSections(scrollRoot, sections));
    await waitFor(() => expect(result.current).toEqual([sections[1], sections[2]]));
    act(() => { append("overview-value-over-time"); });
    await waitFor(() => expect(result.current).toEqual(sections));
    act(() => { root.querySelector("#overview-value-over-time")?.remove(); });
    await waitFor(() => expect(result.current).toEqual([sections[1], sections[2]]));
  });

  it("an empty tab gives an empty list", async () => {
    const { result, rerender } = renderHook(
      ({ list }) => useRenderedSections(scrollRoot, list),
      { initialProps: { list: sections } },
    );
    await waitFor(() => expect(result.current).toEqual([]));
    act(() => { append("overview-sips"); });
    await waitFor(() => expect(result.current).toEqual([sections[1]]));
    rerender({ list: [] });
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("a failed section still appears (it keeps its anchor)", async () => {
    const section = append("overview-sips");
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = "This section failed to load.";
    section.append(alert);
    const { result } = renderHook(() => useRenderedSections(scrollRoot, sections));
    await waitFor(() => expect(result.current).toEqual([sections[1]]));
  });
});
