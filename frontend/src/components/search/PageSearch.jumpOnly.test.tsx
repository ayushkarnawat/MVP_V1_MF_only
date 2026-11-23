import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("./useScopeJump", () => ({ useScopeJump: () => ({ jumpTo: mocks.jumpTo, switchFor: mocks.switchFor }) }));
vi.mock("./recentSearches", () => ({
  readRecentFunds: mocks.readFunds, readRecentSearches: mocks.readSearches, pushRecentSearch: mocks.pushSearch,
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
const row: ResultRow = {
  id: "fund:example", kind: "fund", title: fund.name,
  action: { type: "jump-fund", schemeId: "example", switchTo: { memberIds: ["bela"], label: "Bela" } },
};
const props: PageFilterSource & { userId: string | null; jumpOnly: boolean } = {
  pageKey: "fund", noun: "funds", total: 41, matched: 6, chipsAllowed: [], userId: "example-user", jumpOnly: true,
};
function type(text = "example") {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  return input;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.initialText = ""; mocks.initialChips = []; mocks.status = "ready";
  mocks.data = { generated_at: "2026-11-23T10:00:00+05:30", funds: [fund] };
  mocks.build.mockReturnValue([]); mocks.readFunds.mockReturnValue([]); mocks.readSearches.mockReturnValue([]);
  mocks.switchFor.mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PageSearch jump-only mode", () => {
  it("jump only: no page-match row", () => {
    render(<PageSearch {...props} />);
    type();
    expect(screen.queryByTestId("row-page-match")).not.toBeInTheDocument();
    expect(screen.queryByText("6 of 41 funds")).not.toBeInTheDocument();
  });
  it("jump only: typing shows the groups and the live count", () => {
    mocks.build.mockReturnValue([{ kind: "fund", label: "Your funds", rows: [row], total: 1 }]);
    render(<PageSearch {...props} />);
    type();
    expect(screen.getByText("Your funds")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Example Growth Fund/ })).toBeInTheDocument();
    expect(screen.getByTestId("search-live")).toHaveTextContent(/^1 result$/);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(mocks.setText).not.toHaveBeenCalled();
  });
  it("jump only: Enter with no active row leaves the page text alone and keeps the dropdown open", () => {
    render(<PageSearch {...props} />);
    const input = type();
    expect(input.getAttribute("aria-activedescendant")).toBeFalsy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(mocks.pushSearch).not.toHaveBeenCalled();
    expect(input).toHaveValue("example");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
  it("jump only: Enter on a fund row still jumps", () => {
    mocks.build.mockReturnValue([{ kind: "fund", label: "Your funds", rows: [row], total: 1 }]);
    render(<PageSearch {...props} />);
    const input = type();
    const option = screen.getByRole("option", { name: /Example Growth Fund/ });
    for (let i = 0; i <= screen.getAllByRole("option").length; i += 1) {
      if (option.id && input.getAttribute("aria-activedescendant") === option.id) break;
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    expect(option.id).not.toBe("");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.jumpTo).toHaveBeenCalledWith(fund);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(mocks.pushSearch).not.toHaveBeenCalled();
  });
  it('jump only: a no-match shows Nothing found for "x".', () => {
    render(<PageSearch {...props} />);
    type("x");
    expect(screen.getByText('Nothing found for "x".')).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
  it("jump only: the index error line still shows with Try again", () => {
    mocks.status = "error"; mocks.data = null;
    render(<PageSearch {...props} />);
    type();
    expect(screen.getByText("Some results are unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByTestId("row-page-match")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
  it("default mode still shows the page-match row", () => {
    const { jumpOnly: _jumpOnly, ...defaultProps } = props;
    render(<PageSearch {...defaultProps} />);
    type();
    expect(screen.getByTestId("row-page-match")).toHaveTextContent("6 of 41 funds");
  });
});
