import { matchesItem, type SearchableField } from "./matcher";
import type { ParsedQuery } from "./queryParser";
import type {
  PageFilterSource,
  Recents,
  ResultGroup,
  ResultKind,
  ResultRow,
  SearchScope,
  SectionEntry,
} from "./searchResultTypes";
import type { SearchFund, SearchIndexResponse } from "./searchTypes";

const MAX_ROWS_PER_GROUP = 3;
const MAX_PAGE_ROWS = 2;
const MAX_TOTAL_ROWS = 30;

function formatPlanType(planType: string): string {
  if (planType === "direct") return "Direct";
  if (planType === "regular") return "Regular";
  return planType;
}

function resolveSwitchTo(
  fund: SearchFund,
  scope: SearchScope,
): { memberIds: string[]; label: string } | null {
  if (scope.memberIds === "family") return null;
  if (fund.holders.some((h) => scope.memberIds.includes(h.member_id))) return null;
  if (fund.holders.length === 1) {
    return { memberIds: [fund.holders[0].member_id], label: fund.holders[0].member_name };
  }
  if (fund.holders.length > 1) {
    return { memberIds: [], label: "Family" };
  }
  return null;
}

function buildFundRow(fund: SearchFund, scope: SearchScope): ResultRow {
  const openHolders = fund.holders.filter((h) => h.state === "open");
  const holderNames = openHolders.map((h) => h.member_name).join(", ");
  const parts = [fund.amc_name, formatPlanType(fund.plan_type), fund.sebi_category, holderNames].filter(
    (p): p is string => Boolean(p),
  );
  const switchTo = resolveSwitchTo(fund, scope);
  const isOpen = openHolders.length > 0;
  const tag = switchTo ? `Switches to ${switchTo.label}` : isOpen ? "open" : "sold";

  return {
    id: `fund:${fund.scheme_id}`,
    kind: "fund",
    title: fund.name,
    subtitle: parts.join(" · "),
    tag,
    action: { type: "jump-fund", schemeId: fund.scheme_id, switchTo },
  };
}

function buildFundFields(fund: SearchFund, aliases?: (amcName: string) => string[]): SearchableField[] {
  const fields: SearchableField[] = [
    { value: fund.name, kind: "name" },
    { value: fund.amc_name, kind: "name" },
    { value: fund.plan_type, kind: "text" },
  ];
  if (aliases) {
    for (const alias of aliases(fund.amc_name)) {
      fields.push({ value: alias, kind: "alias" });
    }
  }
  if (fund.sebi_category) {
    fields.push({ value: fund.sebi_category, kind: "name" });
  }
  if (fund.main_manager) {
    fields.push({ value: fund.main_manager, kind: "name" });
  }
  for (const holder of fund.holders) {
    fields.push({ value: holder.member_name, kind: "name" });
  }
  return fields;
}

function buildFundResults(
  words: string[],
  funds: SearchFund[],
  scope: SearchScope,
  aliases?: (amcName: string) => string[],
): ResultRow[] {
  if (words.length === 0) return [];
  const scored: Array<{ fund: SearchFund; rank: number; isOpen: boolean }> = [];
  for (const fund of funds) {
    const rank = matchesItem(words, { fields: buildFundFields(fund, aliases) });
    if (rank > 0) {
      scored.push({
        fund,
        rank,
        isOpen: fund.holders.some((h) => h.state === "open"),
      });
    }
  }
  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return a.fund.name.localeCompare(b.fund.name);
  });
  return scored.map((s) => buildFundRow(s.fund, scope));
}

function buildCategoryResults(
  words: string[],
  funds: SearchFund[],
  source: PageFilterSource,
): ResultRow[] {
  if (words.length === 0) return [];
  const counts = new Map<string, number>();
  for (const fund of funds) {
    if (!fund.sebi_category) continue;
    counts.set(fund.sebi_category, (counts.get(fund.sebi_category) ?? 0) + 1);
  }
  const canFilter = source.chipsAllowed.includes("category");
  const matched: Array<{ cat: string; rank: number; count: number }> = [];
  for (const [cat, count] of counts.entries()) {
    const rank = matchesItem(words, { fields: [{ value: cat, kind: "name" }] });
    if (rank > 0) matched.push({ cat, rank, count });
  }
  matched.sort((a, b) => (b.rank !== a.rank ? b.rank - a.rank : a.cat.localeCompare(b.cat)));
  return matched.map(({ cat, count }) => ({
    id: `category:${cat}`,
    kind: "category",
    title: cat,
    subtitle: `${count} ${count === 1 ? "fund" : "funds"}`,
    tag: canFilter ? "filter" : "open",
    action: canFilter
      ? { type: "filter", chip: { kind: "category", value: cat } }
      : { type: "go", path: "/portfolio/mutual-funds/allocation" },
  }));
}

function buildManagerResults(words: string[], funds: SearchFund[]): ResultRow[] {
  if (words.length === 0) return [];
  const openCounts = new Map<string, number>();
  for (const fund of funds) {
    if (!fund.main_manager) continue;
    const isOpen = fund.holders.some((h) => h.state === "open");
    openCounts.set(fund.main_manager, (openCounts.get(fund.main_manager) ?? 0) + (isOpen ? 1 : 0));
  }
  const matched: Array<{ mgr: string; rank: number; openCount: number }> = [];
  for (const [mgr, openCount] of openCounts.entries()) {
    const rank = matchesItem(words, { fields: [{ value: mgr, kind: "name" }] });
    if (rank > 0) matched.push({ mgr, rank, openCount });
  }
  matched.sort((a, b) => (b.rank !== a.rank ? b.rank - a.rank : a.mgr.localeCompare(b.mgr)));
  return matched.map(({ mgr, openCount }) => ({
    id: `manager:${mgr}`,
    kind: "manager",
    title: mgr,
    subtitle: `Main manager · ${openCount} ${openCount === 1 ? "fund" : "funds"} open`,
    tag: "open",
    action: { type: "go", path: "/portfolio/mutual-funds/allocation", sectionId: "allocation-fund-manager" },
  }));
}

function buildMemberResults(words: string[], funds: SearchFund[]): ResultRow[] {
  if (words.length === 0) return [];
  const members = new Map<string, { name: string; count: number }>();
  for (const fund of funds) {
    for (const holder of fund.holders) {
      const existing = members.get(holder.member_id);
      if (existing) {
        existing.count += 1;
      } else {
        members.set(holder.member_id, { name: holder.member_name, count: 1 });
      }
    }
  }
  const matched: Array<{ id: string; name: string; count: number; rank: number }> = [];
  for (const [id, info] of members.entries()) {
    const rank = matchesItem(words, { fields: [{ value: info.name, kind: "name" }] });
    if (rank > 0) matched.push({ id, name: info.name, count: info.count, rank });
  }
  matched.sort((a, b) => (b.rank !== a.rank ? b.rank - a.rank : a.name.localeCompare(b.name)));
  return matched.map(({ id, name, count }) => ({
    id: `member:${id}`,
    kind: "member",
    title: name,
    subtitle: `Member · ${count} ${count === 1 ? "fund" : "funds"}`,
    tag: `Switches to ${name}`,
    action: { type: "switch-member", memberId: id, label: name },
  }));
}

function formatSipStatus(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "active") return "Active";
  if (lower === "stopped") return "Stopped";
  return status;
}

function buildSipResults(
  words: string[],
  funds: SearchFund[],
  aliases?: (amcName: string) => string[],
): ResultRow[] {
  if (words.length === 0) return [];
  const matched: Array<{ row: ResultRow; rank: number }> = [];
  for (const fund of funds) {
    for (const holder of fund.holders) {
      if (!holder.sip) continue;
      const fields: SearchableField[] = [
        { value: fund.name, kind: "name" },
        { value: fund.amc_name, kind: "name" },
        { value: holder.member_name, kind: "name" },
        { value: "sip", kind: "text" },
        { value: holder.sip.status, kind: "text" },
      ];
      if (aliases) {
        for (const alias of aliases(fund.amc_name)) {
          fields.push({ value: alias, kind: "alias" });
        }
      }
      const rank = matchesItem(words, { fields });
      if (rank > 0) {
        const statusLabel = formatSipStatus(holder.sip.status);
        const subtitle = holder.sip.next_due_date
          ? `${statusLabel} · next ${holder.sip.next_due_date}`
          : statusLabel;
        matched.push({
          rank,
          row: {
            id: `sip:${fund.scheme_id}:${holder.member_id}`,
            kind: "sip",
            title: `SIP · ${fund.name}`,
            subtitle,
            tag: "show",
            action: { type: "go", path: "/portfolio/mutual-funds", sectionId: "overview-sips" },
          },
        });
      }
    }
  }
  matched.sort((a, b) =>
    b.rank !== a.rank ? b.rank - a.rank : a.row.title.localeCompare(b.row.title),
  );
  return matched.map((m) => m.row);
}

function buildPageResults(words: string[], registry: SectionEntry[]): ResultRow[] {
  if (words.length === 0) return [];
  const matched: Array<{ entry: SectionEntry; rank: number }> = [];
  for (const entry of registry) {
    const rank = matchesItem(words, {
      fields: [
        { value: entry.title, kind: "name" },
        { value: entry.tabLabel, kind: "text" },
      ],
    });
    if (rank > 0) matched.push({ entry, rank });
  }
  matched.sort((a, b) => (b.rank !== a.rank ? b.rank - a.rank : a.entry.title.localeCompare(b.entry.title)));
  return matched.map(({ entry }) => {
    const title = entry.tabLabel ? `${entry.tabLabel} › ${entry.title}` : entry.title;
    if (!entry.built) {
      return {
        id: `page:${entry.id}`,
        kind: "page",
        title,
        subtitle: "Page not built yet",
        tag: "Coming soon",
        disabled: true,
        action: { type: "none" },
      };
    }
    return {
      id: `page:${entry.id}`,
      kind: "page",
      title,
      subtitle: "Page · scrolls to the section",
      tag: "go",
      action: { type: "go", path: entry.path, sectionId: entry.id },
    };
  });
}

function appendGroup(
  groups: ResultGroup[],
  kind: ResultKind,
  label: string,
  allRows: ResultRow[],
  maxRows: number,
  remainingBudget: number,
): number {
  if (allRows.length === 0 || remainingBudget <= 0) return remainingBudget;
  const cap = Math.min(maxRows, remainingBudget);
  const rows = allRows.slice(0, cap);
  groups.push({ kind, label, rows, total: allRows.length });
  return remainingBudget - rows.length;
}

/**
 * Builds capped, deterministic search result groups from the parsed query,
 * household index, page section registry, recents, and current member scope.
 */
export function buildResults(
  query: ParsedQuery,
  source: PageFilterSource,
  index: SearchIndexResponse | null,
  registry: SectionEntry[],
  recents: Recents,
  scope: SearchScope,
  aliases?: (amcName: string) => string[],
): ResultGroup[] {
  const hasQuery =
    query.words.length > 0 ||
    Boolean(query.typeWord) ||
    query.year !== undefined ||
    Boolean(query.month) ||
    Boolean(query.amount);

  if (!hasQuery) {
    if (!index || recents.funds.length === 0) return [];
    const byId = new Map(index.funds.map((f) => [f.scheme_id, f]));
    const recentRows: ResultRow[] = [];
    for (const id of recents.funds) {
      const fund = byId.get(id);
      if (fund) recentRows.push(buildFundRow(fund, scope));
    }
    if (recentRows.length === 0) return [];
    return [{ kind: "fund", label: "Recent funds", rows: recentRows.slice(0, MAX_ROWS_PER_GROUP), total: recentRows.length }];
  }

  const funds = index?.funds ?? [];
  const groups: ResultGroup[] = [];
  let budget = MAX_TOTAL_ROWS;

  budget = appendGroup(groups, "fund", "Your funds", buildFundResults(query.words, funds, scope, aliases), MAX_ROWS_PER_GROUP, budget);
  budget = appendGroup(groups, "category", "Categories", buildCategoryResults(query.words, funds, source), MAX_ROWS_PER_GROUP, budget);
  budget = appendGroup(groups, "manager", "Fund managers", buildManagerResults(query.words, funds), MAX_ROWS_PER_GROUP, budget);
  budget = appendGroup(groups, "member", "Members", buildMemberResults(query.words, funds), MAX_ROWS_PER_GROUP, budget);
  budget = appendGroup(groups, "sip", "SIPs", buildSipResults(query.words, funds, aliases), MAX_ROWS_PER_GROUP, budget);

  const txText = [
    ...query.words,
    query.typeWord,
    query.month,
    query.year !== undefined ? String(query.year) : undefined,
    query.amount,
  ]
    .filter((p): p is string => Boolean(p))
    .join(" ");

  if (txText) {
    budget = appendGroup(
      groups,
      "transactions",
      "Transactions",
      [
        {
          id: "handoff:transactions",
          kind: "transactions",
          title: `Search transactions for "${txText}"`,
          subtitle: "Opens Transactions with the text filled in",
          tag: "go",
          action: { type: "go", path: "/portfolio/mutual-funds/transactions", text: txText },
        },
      ],
      MAX_ROWS_PER_GROUP,
      budget,
    );
  }

  if (query.words.length > 0) {
    const stockText = query.words.join(" ");
    budget = appendGroup(
      groups,
      "stocks",
      "Inside your funds",
      [
        {
          id: "handoff:stocks",
          kind: "stocks",
          title: `Search stocks for "${stockText}"`,
          subtitle: "Opens Holdings with the text filled in",
          tag: "go",
          action: { type: "go", path: "/portfolio/mutual-funds/holdings", text: stockText },
        },
      ],
      MAX_ROWS_PER_GROUP,
      budget,
    );
  }

  appendGroup(groups, "page", "Pages and sections", buildPageResults(query.words, registry), MAX_PAGE_ROWS, budget);

  return groups;
}
