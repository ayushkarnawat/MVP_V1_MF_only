import { describe, expect, it } from "vitest";
import { buildResults } from "./buildResults";
import { parseQuery } from "./queryParser";
import type { SearchIndexResponse } from "./searchTypes";
import type { PageFilterSource, Recents, SearchScope, SectionEntry } from "./searchResultTypes";

const baseSource: PageFilterSource = {
  pageKey: "overview",
  noun: "funds",
  total: 10,
  matched: 2,
  chipsAllowed: ["category", "member", "period"],
};

const sampleIndex: SearchIndexResponse = {
  generated_at: "2026-11-20T10:00:00+05:30",
  funds: [
    {
      scheme_id: "s-hdfc-flexi",
      name: "HDFC Flexi Cap Fund",
      amc_name: "HDFC Mutual Fund",
      sebi_category: "Flexi Cap",
      plan_type: "direct",
      main_manager: "Roshi Jain",
      holders: [
        { member_id: "m-ravi", member_name: "Ravi Rao", state: "open", sip: { status: "active", next_due_date: "05 Dec" } },
        { member_id: "m-asha", member_name: "Asha Rao", state: "open", sip: null },
      ],
    },
    {
      scheme_id: "s-hdfc-mid",
      name: "HDFC Mid-Cap Opportunities Fund",
      amc_name: "HDFC Mutual Fund",
      sebi_category: "Mid Cap",
      plan_type: "direct",
      main_manager: "Chirag Setalvad",
      holders: [
        { member_id: "m-asha", member_name: "Asha Rao", state: "open", sip: { status: "stopped", next_due_date: "10 Jan" } },
      ],
    },
    {
      scheme_id: "s-sbi-small",
      name: "SBI Small Cap Fund",
      amc_name: "SBI Mutual Fund",
      sebi_category: "Small Cap",
      plan_type: "regular",
      main_manager: "R. Srinivasan",
      holders: [
        { member_id: "m-ravi", member_name: "Ravi Rao", state: "sold", sip: null },
      ],
    },
  ],
};

const sampleRegistry: SectionEntry[] = [
  { id: "allocation-fund-manager", title: "Fund Manager Allocation", path: "/portfolio/mutual-funds/allocation", tabLabel: "Allocation", built: true },
  { id: "overview-sips", title: "SIPs Overview", path: "/portfolio/mutual-funds", tabLabel: "Overview", built: true },
  { id: "gold", title: "Gold", path: "/portfolio/gold", tabLabel: "Portfolio", built: false },
  { id: "bonds", title: "Gold Bonds", path: "/portfolio/bonds", tabLabel: "Portfolio", built: false },
  { id: "silver", title: "Gold Silver", path: "/portfolio/silver", tabLabel: "Portfolio", built: false },
];

const emptyRecents: Recents = { funds: [], searches: [] };
const raviScope: SearchScope = { memberIds: ["m-ravi"] };
const familyScope: SearchScope = { memberIds: "family" };

const aliasStub = (amc: string) => (amc.toLowerCase().includes("sbi") ? ["sbi", "sbimf"] : []);

describe("buildResults", () => {
  it("returns recent funds on empty query when recents has funds, otherwise []", () => {
    expect(buildResults(parseQuery(""), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope)).toEqual([]);
    const res = buildResults(
      parseQuery(""),
      baseSource,
      sampleIndex,
      sampleRegistry,
      { funds: ["s-hdfc-mid", "missing-id", "s-hdfc-flexi"], searches: [] },
      raviScope,
    );
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe("fund");
    expect(res[0].rows.map((r) => r.id)).toEqual(["fund:s-hdfc-mid", "fund:s-hdfc-flexi"]);
  });

  it("handles the 'hdfc' journey: no fund-house row, switchTo tag for Asha-only fund", () => {
    const groups = buildResults(parseQuery("hdfc"), baseSource, sampleIndex, sampleRegistry, emptyRecents, raviScope, aliasStub);
    const kinds = groups.map((g) => g.kind);
    expect(kinds).toContain("fund");
    expect(kinds).toContain("transactions");
    expect(kinds).toContain("stocks");
    // No fund-house row exists
    const fundGroup = groups.find((g) => g.kind === "fund")!;
    expect(fundGroup.rows).toHaveLength(2);
    const flexi = fundGroup.rows.find((r) => r.title.includes("Flexi Cap"))!;
    const mid = fundGroup.rows.find((r) => r.title.includes("Mid-Cap"))!;
    expect(flexi.action).toEqual({ type: "jump-fund", schemeId: "s-hdfc-flexi", switchTo: null });
    expect(mid.action).toEqual({
      type: "jump-fund",
      schemeId: "s-hdfc-mid",
      switchTo: { memberIds: ["m-asha"], label: "Asha Rao" },
    });
    expect(mid.tag).toBe("Switches to Asha Rao");
  });

  it("resolves several out-of-scope holders to Family switchTo", () => {
    const groups = buildResults(parseQuery("hdfc flexi"), baseSource, sampleIndex, sampleRegistry, emptyRecents, { memberIds: ["m-other"] });
    const fundGroup = groups.find((g) => g.kind === "fund")!;
    expect(fundGroup.rows[0].action).toEqual({
      type: "jump-fund",
      schemeId: "s-hdfc-flexi",
      switchTo: { memberIds: [], label: "Family" },
    });
    expect(fundGroup.rows[0].tag).toBe("Switches to Family");
  });

  it("finds SBI funds via alias stub and returns no rows for a house with no holdings", () => {
    const sbiGroups = buildResults(parseQuery("sbi"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope, aliasStub);
    const fundGroup = sbiGroups.find((g) => g.kind === "fund")!;
    expect(fundGroup.rows[0].title).toBe("SBI Small Cap Fund");

    const noneGroups = buildResults(parseQuery("icici"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope, aliasStub);
    expect(noneGroups.find((g) => g.kind === "fund")).toBeUndefined();
  });

  it("caps groups at 3 rows (pages at 2), preserves total, and caps overall at 30", () => {
    const manyFunds: SearchIndexResponse = {
      generated_at: "2026-11-20T10:00:00+05:30",
      funds: Array.from({ length: 12 }, (_, i) => ({
        scheme_id: `f-${i}`,
        name: `Alpha Fund ${i}`,
        amc_name: "Alpha AMC",
        sebi_category: `Alpha Cat ${i}`,
        plan_type: "direct",
        main_manager: `Alpha Mgr ${i}`,
        holders: [
          {
            member_id: `m-${i}`,
            member_name: `Alpha Member ${i}`,
            state: "open" as const,
            sip: { status: "active", next_due_date: "01 Dec" },
          },
        ],
      })),
    };
    const groups = buildResults(parseQuery("alpha"), baseSource, manyFunds, sampleRegistry, emptyRecents, familyScope);
    for (const g of groups) {
      expect(g.rows.length).toBeLessThanOrEqual(g.kind === "page" ? 2 : 3);
    }
    const fundGroup = groups.find((g) => g.kind === "fund")!;
    expect(fundGroup.rows).toHaveLength(3);
    expect(fundGroup.total).toBe(12);
    const totalShown = groups.reduce((sum, g) => sum + g.rows.length, 0);
    expect(totalShown).toBeLessThanOrEqual(30);
  });

  it("marks unbuilt pages as disabled 'Coming soon' and caps pages at 2", () => {
    const groups = buildResults(parseQuery("gold"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    const pageGroup = groups.find((g) => g.kind === "page")!;
    expect(pageGroup.rows).toHaveLength(2);
    expect(pageGroup.total).toBe(3);
    expect(pageGroup.rows[0].disabled).toBe(true);
    expect(pageGroup.rows[0].tag).toBe("Coming soon");
    expect(pageGroup.rows[0].action).toEqual({ type: "none" });
  });

  it("category rows emit filter chip when chipsAllowed includes category, otherwise go to allocation", () => {
    const withChip = buildResults(parseQuery("flexi"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    const catWithChip = withChip.find((g) => g.kind === "category")!.rows[0];
    expect(catWithChip.action).toEqual({ type: "filter", chip: { kind: "category", value: "Flexi Cap" } });

    const noChipSource: PageFilterSource = { ...baseSource, chipsAllowed: ["member"] };
    const withoutChip = buildResults(parseQuery("flexi"), noChipSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    const catWithoutChip = withoutChip.find((g) => g.kind === "category")!.rows[0];
    expect(catWithoutChip.action).toEqual({ type: "go", path: "/portfolio/mutual-funds/allocation" });
  });

  it("emits transactions handoff for type/year/month/amount even without text words, and stocks only with text words", () => {
    const txOnly = buildResults(parseQuery("redemption 2025"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    expect(txOnly.find((g) => g.kind === "transactions")).toBeDefined();
    expect(txOnly.find((g) => g.kind === "stocks")).toBeUndefined();
  });

  it("includes stopped SIPs and matches only main_manager for managers", () => {
    const sipGroups = buildResults(parseQuery("hdfc"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    const sips = sipGroups.find((g) => g.kind === "sip")!;
    expect(sips.rows.some((r) => r.subtitle?.startsWith("Stopped"))).toBe(true);

    const mgrGroups = buildResults(parseQuery("roshi"), baseSource, sampleIndex, sampleRegistry, emptyRecents, familyScope);
    const mgr = mgrGroups.find((g) => g.kind === "manager")!;
    expect(mgr.rows[0].title).toBe("Roshi Jain");
    expect(mgr.rows[0].action).toEqual({
      type: "go",
      path: "/portfolio/mutual-funds/allocation",
      sectionId: "allocation-fund-manager",
    });
  });
});
