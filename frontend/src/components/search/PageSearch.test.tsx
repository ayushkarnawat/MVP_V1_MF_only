import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NavigateOptions, To } from "react-router";
import type { ResultGroup, ResultRow, PageFilterSource } from "./searchResultTypes";
import type { SearchFund, SearchIndexResponse } from "./searchTypes";
import { parseQuery } from "./queryParser";
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
  id: "fund:example", kind: "fund", title: fund.name, tag: "Switches to Bela",
  action: { type: "jump-fund", schemeId: fund.scheme_id, switchTo: { memberIds: ["bela"], label: "Bela" } },
};
const filterRow: ResultRow = {
  id: "category:flexi", kind: "category", title: "Flexi Cap",
  action: { type: "filter", chip: { kind: "category", value: "Flexi Cap" } },
};
const goRow: ResultRow = {
  id: "page:allocation", kind: "page", title: "Allocation",
  action: { type: "go", path: "/portfolio/mutual-funds/allocation", sectionId: "asset-allocation" },
};
const memberRow: ResultRow = {
  id: "member:bela", kind: "member", title: "Bela", tag: "Switches to Bela",
  action: { type: "switch-member", memberId: "bela", label: "Bela" },
};
const disabledRow: ResultRow = {
  id: "page:future", kind: "page", title: "Future page", disabled: true, action: { type: "none" },
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
function choose(title: string) {
  const input = screen.getByRole("combobox");
  const option = screen.getByRole("option", { name: new RegExp(title) });
  for (let i = 0; i <= screen.getAllByRole("option").length; i += 1) {
    if (input.getAttribute("aria-activedescendant") === option.id && option.id) break;
    fireEvent.keyDown(input, { key: "ArrowDown" });
  }
  expect(option.id).not.toBe("");
  expect(input).toHaveAttribute("aria-activedescendant", option.id);
  fireEvent.keyDown(input, { key: "Enter" });
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

describe("1. Rest", () => {
  it.each([["Win32", "Ctrl S"], ["MacIntel", "Cmd S"]])("rest: accessible closed box on %s", (platform, hint) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    render(<PageSearch {...props} />);
    const input = screen.getByRole("combobox", { name: "Search transactions" });
    expect(input).toHaveAttribute("placeholder", "Search transactions");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("search-hint")).toHaveTextContent(hint);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

describe("2. Open empty", () => {
  it.each(["focus", "click"] as const)("open empty: %s opens and loads the index only once", (event) => {
    render(<PageSearch {...props} />);
    const input = screen.getByRole("combobox");
    fireEvent[event](input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent[event](input);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("open empty: shows known recent funds and plain recent searches, skipping unknown ids", () => {
    mocks.readFunds.mockReturnValue(["example", "unknown"]);
    mocks.readSearches.mockReturnValue(["flexi cap"]);
    mocks.build.mockReturnValue([{ kind: "fund", label: "Recent funds", rows: [fundRow], total: 1 }]);
    render(<PageSearch {...props} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText("Recent funds")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Example Growth Fund/ })).toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "flexi cap" })).toBeInTheDocument();
    expect(mocks.readFunds).toHaveBeenCalledWith("example-user");
    expect(mocks.readSearches).toHaveBeenCalledWith("example-user");
  });
});

describe("3. Typing", () => {
  it("typing: rebuilds groups for each draft without filtering the page", () => {
    mocks.build.mockReturnValue(groups(fundRow));
    render(<PageSearch {...props} />);
    type("exam");
    expect(mocks.build.mock.lastCall?.[0]).toEqual(parseQuery("exam"));
    type("example");
    expect(mocks.build.mock.lastCall?.slice(0, 6)).toEqual([
      parseQuery("example"), expect.objectContaining({
        pageKey: "transactions", noun: "transactions", total: 41, matched: 6,
        chipsAllowed: ["period", "member", "category"],
      }), mocks.data, [],
      { funds: [], searches: [] }, { memberIds: ["asha"] },
    ]);
    const options = screen.getAllByRole("option");
    expect(options[0]).toBe(screen.getByTestId("row-page-match"));
    expect(options[0]).toHaveTextContent("6 of 41 transactions");
    expect(screen.getByText("fund results")).toBeInTheDocument();
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-live")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("search-live").getAttribute("aria-live") ?? "polite").toBe("polite");
    expect(screen.getByTestId("search-live")).toHaveTextContent(/^2 results$/);
  });
  it("typing: announces one result when only the page match is shown", () => {
    render(<PageSearch {...props} />);
    type();
    expect(screen.getByTestId("search-live")).toHaveTextContent(/^1 result$/);
  });
});

describe("4. Chosen", () => {
  it.each([fundRow, filterRow, goRow, memberRow])("chosen: Enter runs $action.type and clears the draft", (row) => {
    mocks.build.mockReturnValue(groups(row));
    render(<PageSearch {...props} />);
    const input = type();
    choose(row.title);
    if (row.action.type === "jump-fund") expect(mocks.jumpTo).toHaveBeenCalledWith(fund);
    if (row.action.type === "filter") expect(mocks.addChip).toHaveBeenCalledWith(row.action.chip);
    if (row.action.type === "go") {
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
      const [target, options] = mocks.navigate.mock.calls[0];
      expect(typeof target === "string" ? target : target.pathname).toBe(row.action.path);
      expect(options?.state).toEqual({ searchIntent: { section: "asset-allocation" } });
    }
    if (row.action.type === "switch-member") expect(mocks.setMember).toHaveBeenCalledWith("bela");
    if (row.action.type === "jump-fund") expect(mocks.setMember).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(mocks.pushSearch).not.toHaveBeenCalled();
    expect(mocks.setText).not.toHaveBeenCalled();
  });
  it("chosen: hand-off writes q and passes sectionId as the section intent", () => {
    const row: ResultRow = { ...goRow, title: "Search stocks", subtitle: "Search all stock names", action: {
      type: "go", path: "/portfolio/mutual-funds/holdings", text: "example growth", sectionId: "all-holdings",
    } };
    mocks.build.mockReturnValue(groups(row));
    render(<PageSearch {...props} />);
    type();
    choose(row.title);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const [target, options] = mocks.navigate.mock.calls[0];
    const url = new URL(typeof target === "string" ? target : `${target.pathname ?? ""}${target.search ?? ""}`, "https://example.test");
    expect(url.pathname).toBe("/portfolio/mutual-funds/holdings");
    expect(url.searchParams.get("q")).toBe("example growth");
    expect(options).toEqual({ state: { searchIntent: { section: "all-holdings" } } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(mocks.pushSearch).not.toHaveBeenCalled();
  });
  it("chosen: disabled Coming soon row cannot run an action", () => {
    mocks.build.mockReturnValue(groups(disabledRow));
    render(<PageSearch {...props} />);
    type();
    const row = screen.getByRole("option", { name: /Future page/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(row);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.jumpTo).not.toHaveBeenCalled();
    expect(mocks.setMember).not.toHaveBeenCalled();
    expect(mocks.addChip).not.toHaveBeenCalled();
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(mocks.pushSearch).not.toHaveBeenCalled();
    const input = screen.getByRole("combobox");
    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
      if (input.getAttribute("aria-activedescendant") === row.id) {
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mocks.setText).not.toHaveBeenCalled();
        expect(mocks.pushSearch).not.toHaveBeenCalled();
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      }
    }
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.jumpTo).not.toHaveBeenCalled();
  });
});

describe("5. Enter on the page match", () => {
  it("enter on the page match: applies draft, stores it and closes", () => {
    render(<PageSearch {...props} />);
    const input = type("example growth");
    choose("6 of 41 transactions");
    expect(mocks.setText).toHaveBeenCalledWith("example growth");
    expect(mocks.pushSearch).toHaveBeenCalledWith("example-user", "example growth");
    expect(input).toHaveValue("example growth");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("enter on the page match: Enter without selecting a row also applies the draft", () => {
    render(<PageSearch {...props} />);
    fireEvent.keyDown(type("example"), { key: "Enter" });
    expect(mocks.setText).toHaveBeenCalledWith("example");
    expect(mocks.pushSearch).toHaveBeenCalledWith("example-user", "example");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("enter on the page match: empty text is not stored", () => {
    render(<PageSearch {...props} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.pushSearch).not.toHaveBeenCalled();
  });
});

describe("6. Closed with text", () => {
  it("closed with text: applied text and chips stay; Escape clears text then closes", () => {
    mocks.initialChips = [{ kind: "member", value: "Asha" }];
    render(<PageSearch {...props} />);
    const input = type();
    choose("6 of 41 transactions");
    expect(input).toHaveValue("example");
    expect(screen.getByRole("button", { name: "Remove filter Asha" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mocks.setText).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter Asha" })).toBeInTheDocument();
  });
  it("closed with text: removing a chip returns focus to the input", () => {
    const chip: Chip = { kind: "category", value: "Flexi Cap" };
    mocks.initialChips = [chip];
    render(<PageSearch {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Flexi Cap" }));
    expect(mocks.removeChip).toHaveBeenCalledWith(chip);
    expect(screen.queryByRole("button", { name: "Remove filter Flexi Cap" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });
  it("closed with text: Backspace in an empty input removes only the last chip", () => {
    const first: Chip = { kind: "member", value: "Asha" };
    const last: Chip = { kind: "period", value: "2026" };
    mocks.initialChips = [first, last];
    render(<PageSearch {...props} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
    expect(mocks.removeChip).toHaveBeenCalledTimes(1);
    expect(mocks.removeChip).toHaveBeenCalledWith(last);
    expect(screen.getByRole("button", { name: "Remove filter Asha" })).toBeInTheDocument();
  });
});

describe("7. No match, error and hand-off rows", () => {
  it("no match: keeps the page match above the empty result message", () => {
    render(<PageSearch {...props} />);
    type("missing");
    const list = screen.getByRole("listbox");
    const page = within(list).getByTestId("row-page-match");
    const message = screen.getByText('Nothing found for "missing".'); // outside the listbox (it is not an option)
    expect(page).toHaveTextContent("6 of 41 transactions");
    expect(page.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("index error: retry and the page's own results remain available", () => {
    mocks.status = "error"; mocks.data = null;
    const extra: ResultRow = { id: "tx:own", kind: "transactions", title: "Example transactions", action: { type: "go", path: "/transactions" } };
    mocks.build.mockReturnValue(groups(extra));
    render(<PageSearch {...props} extraResults={[extra]} />);
    type();
    expect(screen.getByText("Some results are unavailable right now.")).toBeInTheDocument();
    expect(screen.getByTestId("row-page-match")).toHaveTextContent("6 of 41 transactions");
    expect(screen.getByRole("option", { name: /Example transactions/ })).toBeInTheDocument();
    expect(mocks.build.mock.lastCall?.[1]).toEqual(expect.objectContaining({ extraResults: [extra] }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
  it("hints: sold tags and hand-off subtitles are rendered as given", () => {
    const row: ResultRow = { ...fundRow, id: "fund:sold", title: sold.name, tag: "Sold", action: { type: "jump-fund", schemeId: "sold", switchTo: null } };
    const handoff: ResultRow = { ...goRow, title: "Search stocks", subtitle: "Search stock names for example", action: { type: "go", path: "/holdings", text: "example" } };
    mocks.build.mockReturnValue(groups(row, handoff));
    render(<PageSearch {...props} />);
    type();
    expect(within(screen.getByRole("option", { name: /Example Sold Fund/ })).getByText("Sold")).toBeInTheDocument();
    expect(screen.getByText("Search stock names for example")).toBeInTheDocument();
  });
  it.each([
    [fundRow, "Switches to Bela"],
    [{ ...fundRow, action: { type: "jump-fund", schemeId: "example", switchTo: null } } as ResultRow, "Go"],
    [goRow, "Go"], [filterRow, "Filter"], [memberRow, "Switches to Bela"], [disabledRow, "Coming soon"],
  ] as const)("hints: hovered $0.id shows %s", (row, hint) => {
    mocks.build.mockReturnValue(groups(row));
    render(<PageSearch {...props} />);
    type();
    fireEvent.mouseEnter(screen.getByRole("option", { name: new RegExp(row.title) }));
    if (row.tag === hint) {
      expect(within(screen.getByRole("option", { name: new RegExp(row.title) })).getByText(hint)).toBeInTheDocument();
      expect(screen.queryByTestId(`row-hint-${row.id}`)).not.toBeInTheDocument();
    } else expect(screen.getByTestId(`row-hint-${row.id}`)).toHaveTextContent(hint);
  });
});

describe("8. Keyboard and ARIA", () => {
  it("keyboard: arrows select options, wrap both ways and expose the active hint", () => {
    mocks.build.mockReturnValue(groups(fundRow, filterRow));
    render(<PageSearch {...props} />);
    const input = type();
    const options = screen.getAllByRole("option");
    chooseActiveFirst(input, options[0]);
    const check = (option: HTMLElement) => {
      expect(option.id).not.toBe("");
      expect(input).toHaveAttribute("aria-activedescendant", option.id);
      for (const item of options) expect(item).toHaveAttribute("aria-selected", String(item === option));
    };
    check(options[0]);
    fireEvent.keyDown(input, { key: "ArrowUp" }); check(options[2]);
    fireEvent.keyDown(input, { key: "ArrowDown" }); check(options[0]);
    fireEvent.keyDown(input, { key: "ArrowDown" }); check(options[1]);
    expect(within(options[1]).getByText("Switches to Bela")).toBeInTheDocument();
    expect(screen.queryByTestId(`row-hint-${fundRow.id}`)).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" }); check(options[2]);
    fireEvent.keyDown(input, { key: "ArrowDown" }); check(options[0]);
  });
  it.each(["ctrlKey", "metaKey"] as const)("Ctrl+S / Cmd+S: %s opens only while mounted and prevents saving", (modifier) => {
    const { unmount } = render(<PageSearch {...props} />);
    const press = () => {
      const event = new KeyboardEvent("keydown", { key: "s", [modifier]: true, bubbles: true, cancelable: true });
      fireEvent(document, event);
      return event;
    };
    expect(press().defaultPrevented).toBe(true);
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    unmount();
    expect(press().defaultPrevented).toBe(false);
  });
  it("keyboard: Tab closes without preventing the next focus", () => {
    render(<><PageSearch {...props} /><button type="button">Next</button></>);
    const input = type();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Next" }).focus();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });
  it("keyboard: Escape clears a local draft before closing on a second Escape", () => {
    render(<PageSearch {...props} />);
    const input = type();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(mocks.setText).not.toHaveBeenCalledWith("example");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("10. Existing screens unchanged", () => {
  it("empty box renders only the input and hint", () => {
    const { container } = render(<PageSearch {...props} />);
    expect(container.textContent).toBe(screen.getByTestId("search-hint").textContent);
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement(); // the announcement region is mounted before the box opens (G2)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

function chooseActiveFirst(input: HTMLElement, first: HTMLElement) {
  for (let i = 0; i <= screen.getAllByRole("option").length; i += 1) {
    if (input.getAttribute("aria-activedescendant") === first.id && first.id) return;
    fireEvent.keyDown(input, { key: "ArrowDown" });
  }
}

describe("visual pass search hints", () => {
  it("shows_a_hint_when_the_box_is_empty_and_there_are_no_recents", () => {
    render(<PageSearch {...props} />);
    expect(screen.queryByTestId("search-empty-hint")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByTestId("search-empty-hint")).toHaveTextContent("Try a fund, a member or a page");
  });
  it("hides_the_hint_once_recents_exist", () => {
    mocks.readSearches.mockReturnValue(["flexi cap"]);
    const view = render(<PageSearch {...props} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "flexi cap" })).toBeInTheDocument();
    expect(screen.queryByTestId("search-empty-hint")).not.toBeInTheDocument();
    view.unmount();
    mocks.readSearches.mockReturnValue([]);
    mocks.readFunds.mockReturnValue(["example"]);
    mocks.build.mockReturnValue(groups(fundRow));
    render(<PageSearch {...props} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /Example Growth Fund/ })).toBeInTheDocument();
    expect(screen.queryByTestId("search-empty-hint")).not.toBeInTheDocument();
  });
  it("hides_the_hint_when_typing", () => {
    render(<PageSearch {...props} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByTestId("search-empty-hint")).toBeInTheDocument();
    type("e");
    expect(screen.queryByTestId("search-empty-hint")).not.toBeInTheDocument();
  });
  it("hint_is_not_an_option", () => {
    render(<PageSearch {...props} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByTestId("search-empty-hint")).not.toHaveAttribute("role", "option");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByTestId("search-live")).toHaveTextContent(/^0 results$/);
  });
  it("does_not_repeat_the_tag_as_the_hover_hint_on_a_member_row", () => {
    mocks.build.mockReturnValue(groups(memberRow));
    render(<PageSearch {...props} />);
    type();
    const row = screen.getByRole("option", { name: /Bela/ });
    fireEvent.mouseEnter(row);
    expect(within(row).getAllByText("Switches to Bela")).toHaveLength(1);
    expect(screen.queryByTestId(`row-hint-${memberRow.id}`)).not.toBeInTheDocument();
  });
  it("does_not_repeat_the_tag_on_a_fund_row_with_switchTo", () => {
    mocks.build.mockReturnValue(groups(fundRow));
    render(<PageSearch {...props} />);
    type();
    const row = screen.getByRole("option", { name: /Example Growth Fund/ });
    fireEvent.mouseEnter(row);
    expect(within(row).getAllByText("Switches to Bela")).toHaveLength(1);
    expect(screen.queryByTestId(`row-hint-${fundRow.id}`)).not.toBeInTheDocument();
  });
  it("still_shows_filter_go_and_coming_soon_hints", () => {
    mocks.build.mockReturnValue(groups(filterRow, goRow, disabledRow));
    render(<PageSearch {...props} />);
    type();
    for (const [row, hint] of [[filterRow, "Filter"], [goRow, "Go"], [disabledRow, "Coming soon"]] as const) {
      fireEvent.mouseEnter(screen.getByRole("option", { name: new RegExp(row.title) }));
      expect(screen.getByTestId(`row-hint-${row.id}`)).toHaveTextContent(hint);
    }
  });
});
