import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfB, analyticsMfBMember, investmentWithdrawal } from "../../../features/mutual-funds/fixtures/mfB";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { cashFlowTiles } from "../../../features/mutual-funds/transactions/transactionsLogic";
import { diffDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { formatCompactRupees, formatRupees } from "../../../lib/format";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PrintSettledContext } from "../../usePrintSettled";
import { CashFlowSectionPrint } from "../transactionsPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const id = "transactions-cash-flow";
function mount(memberId: string | null = null) {
  const settled = vi.fn<(id: string, ready: boolean) => void>();
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: false }}>
    <ScopeContext.Provider value={{ viewMode: memberId ? "member" : "aggregate", memberId, members: [], scopeKey: memberId ? `member:${memberId}` : "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {} }}>
      <PrintSettledContext.Provider value={settled}><CashFlowSectionPrint /></PrintSettledContext.Provider>
    </ScopeContext.Provider>
  </PrintModeProvider>);
  return { ...view, settled };
}
function expectStatic(container: HTMLElement) {
  expect(container.querySelector('button, [role="button"], [title], [data-tooltip], a')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"], [class*="overflow-y-auto"], [class*="max-h-"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
}
beforeEach(() => {
  analyticsStore.invalidate();
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfB());
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("renders the yearly chart and table with the screen fixture's values and totals", async () => {
  const view = mount();
  const chart = await screen.findByRole("img", { name: "Invested each year" });
  const data = investmentWithdrawal();
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(data.yearly.length + 2);
  expect(chart.querySelectorAll('[data-series="invested"]')).toHaveLength(data.yearly.length);
  data.yearly.forEach((year, index) => {
    expect(chart).toHaveTextContent(year.period);
    expect(chart).toHaveTextContent(formatCompactRupees(year.invested));
    expect(rows[index + 1]).toHaveTextContent(year.period);
    expect(rows[index + 1]).toHaveTextContent(formatRupees(year.invested));
    expect(rows[index + 1]).toHaveTextContent(formatRupees(year.withdrawn));
    expect(rows[index + 1]).toHaveTextContent(formatRupees(diffDecimalStrings(year.invested, year.withdrawn)));
  });
  const totalIn = sumDecimalStrings(data.yearly.map(year => year.invested));
  const totalOut = sumDecimalStrings(data.yearly.map(year => year.withdrawn));
  expect(rows[rows.length - 1]).toHaveTextContent(formatRupees(totalIn));
  expect(rows[rows.length - 1]).toHaveTextContent(formatRupees(totalOut));
  expect(rows[rows.length - 1]).toHaveTextContent(formatRupees(diffDecimalStrings(totalIn, totalOut)));
  const tiles = cashFlowTiles(data);
  expect(screen.getByTestId("tile-invested-value")).toHaveTextContent(formatRupees(tiles.invested));
  expect(screen.getByTestId("tile-withdrawn-value")).toHaveTextContent(formatRupees(tiles.withdrawn));
  expect(screen.getByText("Switches: Excluded")).toBeInTheDocument();
  expect(screen.getByTestId("sip-banner")).toBeInTheDocument();
  for (const row of table.querySelectorAll("tr")) expect(row).toHaveStyle({ breakInside: "avoid" });
  expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  for (const heading of view.container.querySelectorAll("h3,h4")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  expectStatic(view.container);
  expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("waits for loaded data before reporting the cash-flow section settled", async () => {
  let finish!: (data: ReturnType<typeof analyticsMfB>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount();
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  expect(screen.queryByRole("img")).toBeNull();
  await act(async () => { finish(analyticsMfB()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("table")).toBeInTheDocument();
});
it("settles a failed read with its failure sentence and no Retry button", async () => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented read failure"));
  const view = mount();
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("settles a stored failed section and an empty yearly result", async () => {
  const failed = analyticsMfB();
  failed.sections.investment_withdrawal = { payload: null, computed_at: null, failed_at: "2026-11-24T00:00:00Z" };
  mocks.getAnalyticsScope.mockResolvedValue(failed);
  const first = mount();
  await waitFor(() => expect(first.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  first.unmount();
  analyticsStore.invalidate();
  const data = investmentWithdrawal();
  data.yearly = [];
  const response = analyticsMfB();
  response.sections.investment_withdrawal!.payload = { members: [], data };
  mocks.getAnalyticsScope.mockResolvedValue(response);
  const second = mount();
  await waitFor(() => expect(second.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  expectStatic(second.container);
});
it("uses the selected member's bare analytics payload", async () => {
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfBMember());
  const view = mount("m1");
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(mocks.getAnalyticsScope).toHaveBeenCalledWith("m1");
  expect(screen.getByRole("table")).toBeInTheDocument();
});
it("retains the screen's opening-holdings and gift notes", async () => {
  const data = investmentWithdrawal();
  data.opening_holdings = "12345.67";
  data.gifts_net = "-234.56";
  const response = analyticsMfB();
  response.sections.investment_withdrawal!.payload = { members: [], data };
  mocks.getAnalyticsScope.mockResolvedValue(response);
  mount();
  expect(await screen.findByTestId("opening-note")).toHaveTextContent(formatRupees(data.opening_holdings));
  expect(screen.getByTestId("gifts-note")).toHaveTextContent(`Gain includes ${formatRupees("234.56")} of units given away as gifts.`);
});
