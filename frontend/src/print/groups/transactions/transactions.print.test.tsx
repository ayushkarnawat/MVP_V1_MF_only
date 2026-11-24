import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfB, investmentWithdrawal } from "../../../features/mutual-funds/fixtures/mfB";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { Ledger } from "../../../features/mutual-funds/transactions/Ledger";
import { CashFlowStrip } from "../../../features/mutual-funds/transactions/CashFlowStrip";
import { cashFlowTiles, ledgerDetail, ledgerRows, missedSipTooltip } from "../../../features/mutual-funds/transactions/transactionsLogic";
import { formatDate, formatRupees } from "../../../lib/format";
import { PrintModeProvider, type PrintModeValue } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { transactionsPrintSections } from "../transactionsPrint";
import { CashFlowDetailsPrint } from "./CashFlowDetailsPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const id = "transactions-ledger";
function ledgerData() {
  const data = investmentWithdrawal();
  const template = ledgerRows(data.monthly, "all")[0].entry;
  data.monthly = [{ period: "2026-10", invested: "0", withdrawn: "0", entries: Array.from({ length: 65 }, (_, index) => ({ ...template, transaction_id: `demo-${String(index).padStart(3, "0")}`, date: index % 2 ? "2026-10-23" : "2026-10-24", direction: index % 2 ? "withdrawn" as const : "invested" as const, scheme_name: "Demo Equity Fund", household_member_name: "Demo Member", units: "12.345", nav: "81.0042", folio_number: "12345678/0" })) }];
  return data;
}
function mount(folios: PrintModeValue["folios"] = "full") {
  const settled = vi.fn<(id: string, ready: boolean) => void>();
  const view = render(<PrintModeProvider value={{ folios, dataDates: false }}>
    <ScopeContext.Provider value={{ viewMode: "aggregate", memberId: null, members: [], scopeKey: "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {} }}>
      <PrintSettledContext.Provider value={settled}>{PRINT_SECTIONS[id].render()}</PrintSettledContext.Provider>
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
  analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset());
  const response = analyticsMfB(); response.sections.investment_withdrawal!.payload = { members: [], data: ledgerData() };
  mocks.getAnalyticsScope.mockResolvedValue(response);
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("registers both sections of the group (cash flow joined once its chart component was merged)", async () => {
  expect(Object.keys(transactionsPrintSections).sort()).toEqual(["transactions-cash-flow", id]);
  const view = mount();
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
  expectStatic(view.container);
});
it("prints all ledger rows newest first with Units, NAV, Folio and the screen's member line", async () => {
  mount();
  await screen.findByRole("table", { name: "All transactions" });
  const rows = ledgerRows(ledgerData().monthly, "all");
  expect(screen.getAllByTestId(/^ledger-row-/).map(row => row.dataset.testid)).toEqual(rows.map(row => `ledger-row-${row.entry.transaction_id}`));
  expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Date", "Fund", "Folio", "Type", "Units", "NAV", "Amount"]);
  const first = screen.getByTestId(`ledger-row-${rows[0].entry.transaction_id}`);
  const detail = ledgerDetail(rows[0].entry)!;
  for (const text of [formatDate(rows[0].entry.date), "Demo Member", detail.units!, detail.nav!, detail.folio!, formatRupees(rows[0].entry.amount)]) expect(first).toHaveTextContent(text);
  const table = screen.getByRole("table");
  expect(table).toHaveClass("w-full", "table-fixed");
  expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  for (const row of table.querySelectorAll("tr")) expect(row).toHaveStyle({ breakInside: "avoid" });
});
it.each([["full", "12345678/0"], ["masked", "XXXX5678/0"], ["none", ""]] as const)("honours %s folios and omits the column for none", async (folios, text) => {
  const view = mount(folios);
  await screen.findByRole("table");
  expect(screen.queryByRole("columnheader", { name: "Folio" }) === null).toBe(folios === "none");
  if (text) expect(screen.getAllByText(text)).toHaveLength(65);
  if (folios !== "full") expect(view.container.textContent).not.toContain("12345678/0");
  expectStatic(view.container);
});
it("ignores ledger type filters, page search and chips in print", () => {
  render(<PrintModeProvider value={{ folios: "none", dataDates: false }}><Ledger buckets={ledgerData().monthly} filter="switches" onFilter={() => {}} search={{ text: "no matching fund", chips: [{ kind: "member", value: "other-demo-member" }, { kind: "period", value: "2000-01" }] }} /></PrintModeProvider>);
  expect(screen.getAllByTestId(/^ledger-row-/)).toHaveLength(65);
  expect(screen.queryByRole("button")).toBeNull();
});
it("keeps missing units, NAV and folios blank of invented values", () => {
  const data = ledgerData();
  const entry = data.monthly[0].entries[0];
  delete entry.units; delete entry.nav; delete entry.folio_number;
  data.monthly[0].entries = [entry];
  render(<PrintModeProvider value={{ folios: "full", dataDates: false }}><Ledger buckets={data.monthly} filter="all" onFilter={() => {}} /></PrintModeProvider>);
  const cells = within(screen.getByTestId(`ledger-row-${entry.transaction_id}`)).getAllByRole("cell");
  expect(cells[1]).toHaveTextContent("—");
  expect(cells[3]).toHaveTextContent("—");
  expect(cells[4]).toHaveTextContent("—");
});
it("waits for the ledger read and settles after loading", async () => {
  let finish!: (data: ReturnType<typeof analyticsMfB>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount();
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  await act(async () => { finish(analyticsMfB()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
});
it("prints the ledger failure sentence and settles without retrying", async () => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented failure"));
  const view = mount();
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("prints static cash-flow tiles, SIP details and the excluded switches line without a chart", () => {
  const data = investmentWithdrawal();
  data.sip_summary.missed_count = 1;
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: false }}><CashFlowDetailsPrint data={data} /></PrintModeProvider>);
  const tiles = cashFlowTiles(data);
  for (const [key, value] of [["invested", tiles.invested], ["withdrawn", tiles.withdrawn], ["switched", tiles.netSwitched], ["net", tiles.netInvested]]) expect(screen.getByTestId(`tile-${key}-value`)).toHaveTextContent(formatRupees(value));
  expect(screen.getByText("Switches: Excluded")).toBeInTheDocument();
  expect(screen.getByText("Only invested, withdrawn and the bars change. Net invested and absolute gain stay the same.")).toBeInTheDocument();
  expect(screen.getByTestId("sip-banner")).toHaveTextContent(formatRupees(data.sip_summary.total_monthly_amount));
  expect(screen.getByTestId("sip-missed")).toHaveTextContent(missedSipTooltip(data.sip_summary));
  expect(view.container.querySelector("svg,table")).toBeNull();
  expectStatic(view.container);
});
it("retains cash-flow tile interaction outside print mode", () => {
  const onFilter = vi.fn();
  render(<CashFlowStrip data={investmentWithdrawal()} filter="all" onFilter={onFilter} />);
  fireEvent.click(screen.getByTestId("tile-invested"));
  expect(onFilter).toHaveBeenCalledWith("purchases");
});
