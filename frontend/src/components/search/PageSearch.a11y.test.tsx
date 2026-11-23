import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NavigateOptions, To } from "react-router";
import type { ResultGroup, ResultRow, PageFilterSource } from "./searchResultTypes";
import type { SearchFund, SearchIndexResponse } from "./searchTypes";
import { PageSearch } from "./PageSearch";

type Chip = { kind: "period" | "member" | "category"; value: string };
const mocks = vi.hoisted(() => ({
  build: vi.fn<(...args: unknown[]) => ResultGroup[]>(),
  load: vi.fn(), retry: vi.fn(), navigate: vi.fn<(to: To, options?: NavigateOptions) => void>(),
  jumpTo: vi.fn<(fund: SearchFund) => void>(), switchFor: vi.fn(),
  setMember: vi.fn(), setText: vi.fn(), addChip: vi.fn(), removeChip: vi.fn(), clear: vi.fn(),
  readFunds: vi.fn<(userId: string | null) => string[]>(),
  readSearches: vi.fn<(userId: string | null) => string[]>(), pushSearch: vi.fn(),
  initialText: "", initialChips: [] as Chip[],
  status: "ready" as "ready" | "error", data: null as SearchIndexResponse | null,
}));

vi.mock("./useSearchIndex", () => ({ useSearchIndex: () => ({
  status: mocks.status, data: mocks.data, load: mocks.load, retry: mocks.retry,
}) }));
vi.mock("./buildResults", () => ({ buildResults: mocks.build }));
vi.mock("./searchRegistry", () => ({ buildSectionEntries: () => [] }));
vi.mock("./useScopeJump", () => ({ useScopeJump: () => ({
  jumpTo: mocks.jumpTo, switchFor: mocks.switchFor,
}) }));
vi.mock("./recentSearches", () => ({
  readRecentFunds: mocks.readFunds, readRecentSearches: mocks.readSearches,
  pushRecentSearch: mocks.pushSearch,
}));
vi.mock("react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("../../shell/scope/ScopeContext", () => ({ useScope: () => ({
  viewMode: "member", memberId: "asha", scopeKey: "member:asha",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }],
  setMember: mocks.setMember, setAggregate: vi.fn(), refreshMembers: vi.fn(),
}) }));
vi.mock("./usePageSearchState", () => ({
  usePageSearchState: () => {
    const [text, updateText] = useState(mocks.initialText);
    const [chips, updateChips] = useState(mocks.initialChips);
    return {
      text, chips,
      setText: (value: string) => { mocks.setText(value); updateText(value); },
      addChip: (chip: Chip) => { mocks.addChip(chip); updateChips((old) => [...old, chip]); },
      removeChip: (chip: Chip) => {
        mocks.removeChip(chip);
        updateChips((old) => old.filter((item) => item.kind !== chip.kind || item.value !== chip.value));
      },
      clear: mocks.clear,
    };
  },
}));

const fund: SearchFund = {
  scheme_id: "example", name: "Example Growth Fund", amc_name: "Example Mutual Fund",
  sebi_category: "Flexi Cap", plan_type: "direct", main_manager: null,
  holders: [{ member_id: "bela", member_name: "Bela", state: "open", sip: null }],
};
const sold: SearchFund = {
  ...fund, scheme_id: "sold", name: "Example Sold Fund",
  holders: [{ member_id: "asha", member_name: "Asha", state: "sold", sip: null }],
};
const fundRow: ResultRow = {
  id: "fund:example", kind: "fund", title: fund.name,
  action: { type: "jump-fund", schemeId: fund.scheme_id, switchTo: { memberIds: ["bela"], label: "Bela" } },
};
const props: PageFilterSource & { userId: string | null } = {
  pageKey: "transactions", noun: "transactions", total: 41, matched: 6,
  chipsAllowed: ["period", "member", "category"], userId: "example-user",
};
function groups(...rows: ResultRow[]): ResultGroup[] {
  return rows.map((row) => ({ kind: row.kind, label: `${row.kind} results`, rows: [row], total: 1 }));
}
function type(text = "example") {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialText = ""; mocks.initialChips = []; mocks.status = "ready";
  mocks.data = { generated_at: "2026-11-23T10:00:00+05:30", funds: [fund, sold] };
  mocks.build.mockReturnValue([]);
  mocks.readFunds.mockReturnValue([]); mocks.readSearches.mockReturnValue([]);
  mocks.switchFor.mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Accessibility findings of the G2 review (23 Nov), pinned.
const categoryRow: ResultRow = {
  id: "category:Flexi Cap", kind: "category", title: "Flexi Cap",
  action: { type: "filter", chip: { kind: "category", value: "Flexi Cap" } },
};
const managerRow: ResultRow = {
  id: "manager:Rajeev Thakkar", kind: "manager", title: "Rajeev Thakkar",
  action: { type: "filter", chip: { kind: "category", value: "Rajeev Thakkar" } },
};

describe("G2 accessibility", () => {
  it("option ids hold no whitespace and are unique, so aria-activedescendant always names one real option", () => {
    mocks.build.mockReturnValue(groups(categoryRow, managerRow, fundRow));
    render(<PageSearch {...props} />);
    const input = type("flexi");
    const options = screen.getAllByRole("option");
    for (const option of options) expect(option.id).toMatch(/^\S+$/);
    expect(new Set(options.map(option => option.id)).size).toBe(options.length);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant") ?? "";
    expect(active).toMatch(/^\S+$/);
    expect(document.getElementById(active)).toHaveAttribute("aria-selected", "true");
  });

  it("the listbox has a name, its groups are labelled groups, and the input says it offers a list", () => {
    mocks.build.mockReturnValue(groups(categoryRow, fundRow));
    render(<PageSearch {...props} />);
    const input = type("flexi");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    const listbox = screen.getByRole("listbox", { name: "Search results" });
    const labelled = within(listbox).getAllByRole("group");
    expect(labelled.map(group => group.getAttribute("aria-label") ?? group.getAttribute("aria-labelledby") ?? "")).not.toContain("");
  });

  it("the results announcement is mounted before the box opens, so the first announcement is not lost", () => {
    render(<PageSearch {...props} />);
    const live = screen.getByTestId("search-live");
    expect(live).toHaveAttribute("role", "status");
    expect(live.textContent).toBe("");
    mocks.build.mockReturnValue(groups(fundRow));
    type("example");
    expect(screen.getByTestId("search-live")).toHaveTextContent(/2 results/);
  });

  it("when the index failed, Try again sits outside the listbox and Tab from the input keeps the list open so it can be reached", () => {
    mocks.status = "error";
    render(<PageSearch {...props} />);
    const input = type("example");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(within(screen.getByRole("listbox", { name: "Search results" })).queryByRole("button")).toBeNull();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(retry).toBeInTheDocument();
  });

  it("the active option is scrolled into view as the arrow keys move", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    mocks.build.mockReturnValue(groups(categoryRow, managerRow, fundRow));
    render(<PageSearch {...props} />);
    const input = type("flexi");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    expect(spy.mock.contexts.at(-1)).toBe(document.getElementById(input.getAttribute("aria-activedescendant") ?? ""));
    spy.mockRestore();
  });
});
