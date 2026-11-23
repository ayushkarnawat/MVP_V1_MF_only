import { describe, expect, it } from "vitest";
import {
  indexVisible,
  MIN_SECTIONS_FOR_INDEX,
  SECTION_LISTS,
  sectionsForTab,
  type MfTabId,
} from "./pageSections";

const ALL_TABS: MfTabId[] = [
  "overview",
  "performance",
  "allocation",
  "holdings",
  "transactions",
  "overlap",
  "analytics",
];

describe("pageSections", () => {
  it("every tab has a list", () => {
    expect(Object.keys(SECTION_LISTS).sort()).toEqual([...ALL_TABS].sort());
    for (const tab of ALL_TABS) {
      expect(Array.isArray(SECTION_LISTS[tab])).toBe(true);
      expect(sectionsForTab(tab)).toEqual(SECTION_LISTS[tab]);
    }
  });

  it("ids and anchors are unique across all tabs", () => {
    const all = ALL_TABS.flatMap(tab => sectionsForTab(tab));
    const ids = all.map(s => s.id);
    const anchors = all.map(s => s.anchor);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("anchors are lower-case slugs prefixed by their tab id", () => {
    for (const tab of ALL_TABS) {
      for (const section of sectionsForTab(tab)) {
        expect(section.anchor).toMatch(/^[a-z0-9-]+$/);
        expect(section.anchor.startsWith(`${tab}-`)).toBe(true);
      }
    }
  });

  it("counts: overview 6, performance 3, allocation 4, holdings 2, transactions 2, overlap 4, analytics 3", () => {
    expect(sectionsForTab("overview")).toHaveLength(6);
    expect(sectionsForTab("performance")).toHaveLength(3);
    expect(sectionsForTab("allocation")).toHaveLength(4);
    expect(sectionsForTab("holdings")).toHaveLength(2);
    expect(sectionsForTab("transactions")).toHaveLength(2);
    expect(sectionsForTab("overlap")).toHaveLength(4);
    expect(sectionsForTab("analytics")).toHaveLength(3);
  });

  it("indexVisible is false for holdings and transactions and true for the others", () => {
    expect(MIN_SECTIONS_FOR_INDEX).toBe(3);
    expect(indexVisible("overview")).toBe(true);
    expect(indexVisible("performance")).toBe(true);
    expect(indexVisible("allocation")).toBe(true);
    expect(indexVisible("holdings")).toBe(false);
    expect(indexVisible("transactions")).toBe(false);
    expect(indexVisible("overlap")).toBe(true);
    expect(indexVisible("analytics")).toBe(true);
  });

  it("overlap titles carry no leading number", () => {
    for (const section of sectionsForTab("overlap")) {
      expect(section.title).not.toMatch(/^\d+\./);
    }
  });

  it("anchor equals id", () => {
    for (const tab of ALL_TABS) {
      for (const section of sectionsForTab(tab)) {
        expect(section.anchor).toBe(section.id);
        expect(section.tier).toBe("standard");
      }
    }
  });
});
