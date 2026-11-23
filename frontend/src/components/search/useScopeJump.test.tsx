import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paths } from "../../shell/nav/paths";
import { ScopeContext } from "../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../shell/scope/scopeTypes";
import * as recents from "./recentSearches";
import type { SearchFund, SearchHolder } from "./searchTypes";
import { resolveScopeSwitch, useScopeJump } from "./useScopeJump";

const members = [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }];
const memberScope = { viewMode: "member" as const, memberId: "asha" };
const familyScope = { viewMode: "aggregate" as const, memberId: "asha" };
const holder = (memberId: string, state: SearchHolder["state"] = "open"): SearchHolder => ({
  member_id: memberId, member_name: memberId === "asha" ? "Asha" : "Bela", state, sip: null,
});
const fund = (holders: SearchHolder[]): SearchFund => ({
  scheme_id: "example-scheme", name: "Example Growth Fund", amc_name: "Example AMC",
  sebi_category: "Flexi Cap", plan_type: "direct", main_manager: null, holders,
});
const otherFund = fund([holder("bela")]);
type Switch = ReturnType<typeof resolveScopeSwitch>;

const cases: Array<{
  name: string;
  scope: Pick<ScopeValue, "viewMode" | "memberId">;
  holders: SearchHolder[];
  members?: Array<{ id: string; name: string }>;
  expected: Switch;
}> = [
  { name: "family view: null", scope: familyScope, holders: [holder("bela")], expected: null },
  { name: "the viewed member holds it open: null", scope: memberScope, holders: [holder("asha")], expected: null },
  { name: "the viewed member holds it sold: null", scope: memberScope,
    holders: [holder("bela"), holder("asha", "sold")], expected: null },
  { name: "one other holder: that person", scope: memberScope,
    holders: [{ ...holder("bela"), member_name: "Old name" }], expected: { scope: { memberId: "bela" }, label: "Bela" } },
  { name: "several other holders: Family", scope: memberScope,
    holders: [holder("bela"), { ...holder("bela"), member_id: "chitra", member_name: "Chitra" }],
    expected: { scope: "family", label: "Family" } },
  { name: "no holders: null", scope: memberScope, holders: [], expected: null },
  { name: "member name falls back to the holder's member_name", scope: memberScope,
    holders: [holder("bela")], members: [], expected: { scope: { memberId: "bela" }, label: "Bela" } },
];

function Probe({ userId, selectedFund }: { userId: string | null; selectedFund: SearchFund }) {
  const { jumpTo, switchFor } = useScopeJump(userId);
  const location = useLocation();
  return <>
    <output data-testid="path">{location.pathname}</output>
    <output data-testid="state">{JSON.stringify(location.state)}</output>
    <output data-testid="switch">{JSON.stringify(switchFor(selectedFund))}</output>
    <button onClick={() => jumpTo(selectedFund)}>Jump</button>
    <button onClick={() => jumpTo(selectedFund, { section: "overview-sips", open: "sips" })}>Section</button>
    <button onClick={() => jumpTo(selectedFund, { path: paths.mutualFunds.transactions() })}>Custom</button>
  </>;
}

function mount({ scope = memberScope, userId = null, selectedFund = otherFund }: {
  scope?: Pick<ScopeValue, "viewMode" | "memberId">;
  userId?: string | null;
  selectedFund?: SearchFund;
} = {}) {
  const value: ScopeValue = { ...scope, members,
    scopeKey: scope.viewMode === "aggregate" ? "aggregate" : `member:${scope.memberId}`,
    setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(), scopeJump: null,
  };
  return render(<MemoryRouter initialEntries={["/home"]}>
    <ScopeContext.Provider value={value}><Probe userId={userId} selectedFund={selectedFund} /></ScopeContext.Provider>
  </MemoryRouter>);
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "null") as unknown;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("resolveScopeSwitch", () => {
  it.each(cases)("$name", ({ scope, holders, members: memberList = members, expected }) => {
    expect(resolveScopeSwitch(fund(holders), scope, memberList)).toEqual(expected);
  });
});

describe("useScopeJump", () => {
  it("jumpTo goes to the fund page with a member intent", () => {
    mount();
    click("Jump");
    expect(screen.getByTestId("path").textContent).toBe(paths.mutualFunds.fund(otherFund.scheme_id));
    expect(state()).toEqual({ searchIntent: { scope: { memberId: "bela" } } });
  });

  it("jumpTo from the family view sends no scope", () => {
    mount({ scope: familyScope });
    click("Jump");
    expect(screen.getByTestId("path").textContent).toBe(paths.mutualFunds.fund(otherFund.scheme_id));
    expect(state()).toEqual({ searchIntent: {} });
  });

  it("jumpTo with a section and open passes them", () => {
    mount();
    click("Section");
    expect(state()).toEqual({ searchIntent: {
      scope: { memberId: "bela" }, section: "overview-sips", open: "sips",
    } });
  });

  it("a custom path is used when given", () => {
    mount();
    click("Custom");
    expect(screen.getByTestId("path").textContent).toBe(paths.mutualFunds.transactions());
    expect(state()).toEqual({ searchIntent: { scope: { memberId: "bela" } } });
  });

  it("the fund is added to the recent funds only when a user id is given", () => {
    const push = vi.spyOn(recents, "pushRecentFund");
    const signedIn = mount({ userId: "example-user" });
    click("Jump");
    expect(push).toHaveBeenCalledExactlyOnceWith("example-user", "example-scheme");
    expect(recents.readRecentFunds("example-user")).toEqual(["example-scheme"]);
    signedIn.unmount();
    push.mockClear();
    mount();
    click("Jump");
    expect(push).not.toHaveBeenCalled();
    expect(recents.readRecentFunds("example-user")).toEqual(["example-scheme"]);
  });

  it("switchFor matches resolveScopeSwitch", () => {
    for (const { scope, holders } of cases) {
      const selectedFund = fund(holders);
      const view = mount({ scope, selectedFund });
      expect(JSON.parse(screen.getByTestId("switch").textContent ?? "null")).toEqual(
        resolveScopeSwitch(selectedFund, scope, members),
      );
      view.unmount();
    }
  });
});
