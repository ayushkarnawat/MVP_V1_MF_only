import { SECTION_LISTS, type MfTabId, type PageSection } from "../../lib/pageSections";

export interface ExportTabGroup {
  id: MfTabId;
  label: string;
  sections: PageSection[];
}

const TAB_ORDER: { id: MfTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "allocation", label: "Allocation" },
  { id: "holdings", label: "Holdings" },
  { id: "transactions", label: "Transactions" },
  { id: "overlap", label: "Overlap" },
  { id: "analytics", label: "Other Analytics" },
];

export function getExportTabGroups(
  allowedTiers: ("standard" | "pro")[] = ["standard", "pro"],
): ExportTabGroup[] {
  const allowed = new Set(allowedTiers);
  return TAB_ORDER.map(({ id, label }) => ({
    id,
    label,
    sections: SECTION_LISTS[id].filter((sec) => allowed.has(sec.tier)),
  })).filter((group) => group.sections.length > 0);
}

export function getPresetSectionIds(
  preset: "full" | "tab",
  currentTab: MfTabId | null,
  allowedTiers: ("standard" | "pro")[] = ["standard", "pro"],
): string[] {
  const groups = getExportTabGroups(allowedTiers);
  if (preset === "tab" && currentTab) {
    const match = groups.find((g) => g.id === currentTab);
    return match ? match.sections.map((s) => s.id) : [];
  }
  return groups.flatMap((g) => g.sections.map((s) => s.id));
}

export function orderSelectedSectionIds(
  selected: Set<string>,
  allowedTiers: ("standard" | "pro")[] = ["standard", "pro"],
): string[] {
  return getExportTabGroups(allowedTiers)
    .flatMap((g) => g.sections.map((s) => s.id))
    .filter((id) => selected.has(id));
}
