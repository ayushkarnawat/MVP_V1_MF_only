import { describe, expect, it } from "vitest";
import { SECTION_LISTS } from "../lib/pageSections";
import { PRINT_SECTIONS } from "./sectionRegistry";
import { allocationPrintSections } from "./groups/allocationPrint";
import { analyticsPrintSections } from "./groups/analyticsPrint";
import { holdingsPrintSections } from "./groups/holdingsPrint";
import { overlapPrintSections } from "./groups/overlapPrint";
import { overviewPrintSections } from "./groups/overviewPrint";
import { performancePrintSections } from "./groups/performancePrint";
import { transactionsPrintSections } from "./groups/transactionsPrint";

it("every id in SECTION_LISTS has a print entry and no extra ids exist", () => {
  expect(Object.keys(PRINT_SECTIONS).sort()).toEqual(Object.values(SECTION_LISTS).flat().map(section => section.id).sort());
});

it("titles equal the section list titles", () => {
  for (const [tab, sections] of Object.entries(SECTION_LISTS)) {
    for (const section of sections) expect(PRINT_SECTIONS[section.id]).toMatchObject({ tab, title: section.title });
  }
});


describe("print groups", () => {
  it("every id a group names is a real section id, and no id is in two groups", () => {
    const groups = [overviewPrintSections, performancePrintSections, allocationPrintSections, holdingsPrintSections,
      transactionsPrintSections, overlapPrintSections, analyticsPrintSections];
    const seen = new Set<string>();
    for (const group of groups) {
      for (const id of Object.keys(group)) {
        expect(PRINT_SECTIONS[id], id).toBeDefined();
        expect(seen.has(id), `${id} is in two groups`).toBe(false);
        seen.add(id);
      }
    }
  });
});
