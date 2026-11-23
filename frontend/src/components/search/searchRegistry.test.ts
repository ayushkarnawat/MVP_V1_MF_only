import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";
import { SECTION_LISTS, type MfTabId } from "../../lib/pageSections";
import { paths } from "../../shell/nav/paths";
import { buildRegistry } from "../../shell/registry/buildRegistry";
import type { ShellRoute } from "../../shell/registry/types";
import { buildSectionEntries } from "./searchRegistry";

const tabs: Record<MfTabId, { path: string; label: string }> = {
  overview: { path: paths.mutualFunds.root(), label: "Overview" },
  performance: { path: paths.mutualFunds.performance(), label: "Performance" },
  allocation: { path: paths.mutualFunds.allocation(), label: "Allocation" },
  holdings: { path: paths.mutualFunds.holdings(), label: "Holdings" },
  transactions: { path: paths.mutualFunds.transactions(), label: "Transactions" },
  overlap: { path: paths.mutualFunds.overlap(), label: "Overlap" },
  analytics: { path: paths.mutualFunds.analytics(), label: "Other Analytics" },
};

function route(id: string, overrides: Partial<ShellRoute> = {}): ShellRoute {
  return { id, path: `/example/${id}`, label: id, icon: Home, section: "main",
    order: 0, layout: "app", scope: "none", status: "live", title: id, ...overrides };
}

describe("buildSectionEntries", () => {
  it("section entries equal the shared section list, in tab order", () => {
    const expected = (Object.keys(SECTION_LISTS) as MfTabId[]).flatMap(tab =>
      SECTION_LISTS[tab].map(section => ({ id: section.id, title: section.title,
        path: tabs[tab].path, tabLabel: tabs[tab].label, built: true })),
    );
    expect(buildSectionEntries([])).toEqual(expected);
    expect(buildSectionEntries()).toEqual(buildSectionEntries(buildRegistry()));
  });

  it("each tab's entries point at that tab's path and label", () => {
    const entries = buildSectionEntries([]);
    for (const tab of Object.keys(SECTION_LISTS) as MfTabId[]) {
      for (const section of SECTION_LISTS[tab]) {
        expect(entries.find(entry => entry.id === section.id)).toMatchObject({
          path: tabs[tab].path, tabLabel: tabs[tab].label, built: true,
        });
      }
    }
  });

  it("live pages are built and placeholders are not", () => {
    const entries = buildSectionEntries([
      route("live", { label: "Example page" }),
      route("later", { status: "placeholder", label: "Later page" }),
    ]);
    expect(entries.slice(buildSectionEntries([]).length)).toEqual([
      { id: "page:live", title: "Example page", path: "/example/live", tabLabel: "", built: true },
      { id: "page:later", title: "Later page", path: "/example/later", tabLabel: "", built: false },
    ]);
  });

  it("groups, redirects and parameter paths are left out", () => {
    expect(buildSectionEntries([
      route("group", { kind: "group" }),
      route("redirect", { redirectTo: "/home" }),
      route("parameter", { path: "/example/:schemeId" }),
      route("no-path", { path: undefined }),
    ])).toEqual(buildSectionEntries([]));
  });

  it("no section id is invented here", () => {
    const ids = Object.values(SECTION_LISTS).flatMap(sections => sections.map(section => section.id));
    const sections = buildSectionEntries().filter(entry => !entry.id.startsWith("page:"));
    expect(sections).toHaveLength(ids.length);
    for (const entry of sections) expect(ids).toContain(entry.id);
  });
});
