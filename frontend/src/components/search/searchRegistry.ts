import { SECTION_LISTS, type MfTabId } from "../../lib/pageSections";
import { paths } from "../../shell/nav/paths";
import { buildRegistry } from "../../shell/registry/buildRegistry";
import type { ShellRoute } from "../../shell/registry/types";
import type { SectionEntry } from "./searchResultTypes";

const TAB_META: Record<MfTabId, { path: string; label: string }> = {
  overview: { path: paths.mutualFunds.root(), label: "Overview" },
  performance: { path: paths.mutualFunds.performance(), label: "Performance" },
  allocation: { path: paths.mutualFunds.allocation(), label: "Allocation" },
  holdings: { path: paths.mutualFunds.holdings(), label: "Holdings" },
  transactions: { path: paths.mutualFunds.transactions(), label: "Transactions" },
  overlap: { path: paths.mutualFunds.overlap(), label: "Overlap" },
  analytics: { path: paths.mutualFunds.analytics(), label: "Other Analytics" },
};

export function buildSectionEntries(routes: ShellRoute[] = buildRegistry()): SectionEntry[] {
  const sections: SectionEntry[] = (Object.keys(SECTION_LISTS) as MfTabId[]).flatMap((tab) => {
    const meta = TAB_META[tab];
    return SECTION_LISTS[tab].map((section) => ({
      id: section.id,
      title: section.title,
      path: meta.path,
      tabLabel: meta.label,
      built: true,
    }));
  });

  const pages: SectionEntry[] = routes
    .filter(
      (route): route is ShellRoute & { path: string } =>
        Boolean(route.path) &&
        route.kind !== "group" &&
        !route.redirectTo &&
        !route.path!.includes(":"),
    )
    .map((route) => ({
      id: `page:${route.id}`,
      title: route.label,
      path: route.path,
      tabLabel: "",
      built: route.status === "live",
    }));

  return [...sections, ...pages];
}
