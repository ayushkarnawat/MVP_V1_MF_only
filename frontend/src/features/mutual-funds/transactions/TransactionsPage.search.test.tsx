import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import { analyticsStore } from "../data/analyticsStore";
import type { InvestmentWithdrawalEntry, InvestmentWithdrawalResult } from "../types";
import { Ledger } from "./Ledger";
import TransactionsPage from "./TransactionsPage";

const api = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
const searchProps = vi.hoisted(() => vi.fn());
vi.mock("../api", () => api);
vi.mock("../../auth/session", () => ({ getToken: () => "example-session" }));
vi.mock("../../../components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null }) => {
    searchProps(props);
    const { pageKey, noun, total, matched, chipsAllowed } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} />;
  },
}));

function entry(id: string, direction: InvestmentWithdrawalEntry["direction"],
  schemeName: string, memberId: string): InvestmentWithdrawalEntry {
  return { transaction_id: id, date: "2026-11-10", type: direction === "withdrawn" ? "REDEMPTION" : "PURCHASE",
    direction, amount: "1000.00", scheme_name: schemeName,
    household_member_id: memberId, household_member_name: memberId === "asha" ? "Asha" : "Bela" };
}
const entries = [entry("growth-buy", "invested", "Example Growth Fund", "asha"),
  entry("growth-sell", "withdrawn", "Example Growth Fund", "asha"),
  entry("income-buy", "invested", "Example Income Fund", "bela")];
const bucket = { period: "2026-11", invested: "2000.00", withdrawn: "1000.00", entries };
const money: InvestmentWithdrawalResult = {
  total_invested: "2000.00", total_withdrawn: "1000.00", net_invested: "1000.00",
  current_value: "1100.00", absolute_gain: "100.00", monthly: [bucket],
  yearly: [{ ...bucket, period: "2026" }], gifts_net: "0.00", switch_count: 0,
  sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 },
};
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <TransactionsPage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds/transactions${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
const ready = () => screen.findByTestId("tile-invested-value");
const rowIds = () => screen.queryAllByTestId(/^ledger-row-/).map(row => row.getAttribute("data-testid"));
const toggle = (name: string) => within(screen.getByRole("group", { name: "Transaction type" })).getByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  api.getAnalyticsScope.mockResolvedValue({ scope: "combined", recomputing: false, sections: {
    investment_withdrawal: { payload: { members: [], data: money }, computed_at: "2026-11-23T00:00:00Z", failed_at: null },
  } });
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("TransactionsPage search", () => {
  it("the box gets pageKey transactions, noun transactions, chips period and member", async () => {
    mount();
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "transactions");
    expect(box).toHaveAttribute("data-noun", "transactions");
    expect(box).toHaveAttribute("data-chips-allowed", JSON.stringify(["period", "member"]));
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
  });

  it("total is all ledger rows and matched is the rows shown after the type toggle and the search", async () => {
    mount("?q=growth");
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-total", "3");
    expect(box).toHaveAttribute("data-matched", "2");
    fireEvent.click(toggle("Purchases"));
    expect(box).toHaveAttribute("data-total", "3");
    expect(box).toHaveAttribute("data-matched", "1");
    expect(rowIds()).toEqual(["ledger-row-growth-buy"]);
  });

  it("?q= cuts the ledger", async () => {
    mount("?q=bela");
    await ready();
    expect(rowIds()).toEqual(["ledger-row-income-buy"]);
  });

  it("a type word in ?q= switches the type toggle to that type (aria-pressed)", async () => {
    mount("?q=redemption");
    await ready();
    expect(toggle("Redemptions")).toHaveAttribute("aria-pressed", "true");
    expect(toggle("All")).toHaveAttribute("aria-pressed", "false");
    expect(rowIds()).toEqual(["ledger-row-growth-sell"]);
  });

  it("the type toggle still works with no q", async () => {
    mount();
    await ready();
    fireEvent.click(toggle("Purchases"));
    expect(toggle("Purchases")).toHaveAttribute("aria-pressed", "true");
    expect(rowIds()).toEqual(["ledger-row-income-buy", "ledger-row-growth-buy"]);
    fireEvent.click(toggle("All"));
    expect(rowIds()).toHaveLength(3);
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "3");
  });

  it("with no q and no f the ledger is exactly as before", async () => {
    const baseline = mount("", <Ledger buckets={money.monthly} filter="all" onFilter={vi.fn()} />);
    const expected = screen.getAllByTestId(/^ledger-row-/).map(row => row.textContent);
    expect(expected).toHaveLength(3);
    baseline.unmount();
    mount();
    await ready();
    expect(screen.getAllByTestId(/^ledger-row-/).map(row => row.textContent)).toEqual(expected);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
