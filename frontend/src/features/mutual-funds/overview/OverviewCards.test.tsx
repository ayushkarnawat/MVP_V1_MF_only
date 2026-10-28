import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity, failedLoad, loaded, loadingLoad } from "../testing";
import { AmcAllocationCard, FamilyMembersCard, QuickInsightsCard } from "./OverviewCards";
import type { AllocationSummary, FamilyMemberStatus, HoldingRow } from "../types";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const KOTAK = "kotak-mahindra-mutual-fund";

const amc = (over: Partial<Parameters<typeof AmcAllocationCard>[0]> = {}) =>
  renderInShell(<AmcAllocationCard allocation={loaded(fx.allocation().allocation)} holdings={loaded(fx.holdings())} {...over} />, { path: "/portfolio/mutual-funds", scope: { members } });
const family = (over: Partial<Parameters<typeof FamilyMembersCard>[0]> = {}, scope: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<FamilyMembersCard holdings={loaded(fx.holdings())} members={loaded(fx.MEMBERS)} {...over} />, { path: "/portfolio/mutual-funds", scope: { members }, ...scope });

describe("AmcAllocationCard", () => {
  // jsdom cannot measure layout, so this pins the class contract that stops the legend
  // clipping in a third-width card (stacked at lg, side by side only below lg and at 2xl+).
  it("keeps the legend inside a narrow card: stacked at lg, truncating names, percent never shrinks", () => {
    amc();
    const legend = screen.getByRole("list", { name: "AMC allocation" });
    expect(legend).toHaveClass("min-w-0");
    const wrapper = legend.parentElement as HTMLElement;
    expect(wrapper).toHaveClass("flex-col", "lg:flex-col", "lg:items-center", "2xl:flex-row", "2xl:items-start");
    expect(wrapper).not.toHaveClass("flex-row");
    const row = screen.getByTestId(`legend-${KOTAK}`);
    expect(row).toHaveClass("min-w-0");
    const pct = within(row).getByText(/%$/);
    expect(pct).toHaveClass("shrink-0");
  });

  it("shows the total in the centre and one legend row per AMC with its share", () => {
    amc();
    expect(screen.getByRole("heading", { name: "AMC Allocation" })).toBeInTheDocument();
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
    const legend = screen.getByRole("list", { name: "AMC allocation" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId(`legend-${KOTAK}`)).toHaveTextContent("Kotak Mahindra Mutual Fund");
    expect(screen.getByTestId(`legend-${KOTAK}`)).toHaveTextContent("33.1%");
    expect(screen.getByTestId("info-amc")).toHaveAttribute("title", "Current value grouped by asset management company, across all your mutual fund holdings.");
  });
  it("on hover of a slice pops it, dims the others, swaps the centre and shows value and share in the popup", () => {
    amc();
    fireEvent.mouseEnter(screen.getByTestId(`slice-${KOTAK}`));
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Kotak Mahindra Mutual Fund");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹15.40 L");
    expect(screen.getByTestId("slice-hdfc-mutual-fund")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("popup-pct")).toHaveTextContent("33.1%");
    expect(screen.getByTestId("popup-value")).toHaveTextContent("₹15,40,000");
  });
  it("hovering a legend row drives the same donut", () => {
    amc();
    fireEvent.mouseEnter(screen.getByTestId("legend-hdfc-mutual-fund"));
    expect(screen.getByTestId("slice-hdfc-mutual-fund")).toHaveAttribute("data-popped", "true");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("HDFC Mutual Fund");
    fireEvent.mouseLeave(screen.getByTestId("legend-hdfc-mutual-fund"));
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total");
  });
  it("a click on a legend row selects it for good and opens that AMC's holdings", () => {
    amc();
    fireEvent.click(within(screen.getByTestId("legend-hdfc-mutual-fund")).getByRole("button"));
    expect(within(screen.getByTestId("legend-hdfc-mutual-fund")).getByRole("button")).toHaveAttribute("aria-pressed", "true");
    const dialog = screen.getByRole("dialog", { name: "HDFC Mutual Fund" });
    const rows = within(dialog).getAllByTestId("drill-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("HDFC Mid-Cap Opportunities Fund");
    expect(rows[0]).toHaveTextContent("₹13,10,000");
    expect(screen.getByTestId("slice-hdfc-mutual-fund")).toHaveAttribute("data-selected", "true");
  });
  it("a click on a slice does the same and the selection stays after the dialog closes", () => {
    amc();
    fireEvent.click(screen.getByTestId(`slice-${KOTAK}`));
    expect(screen.getByRole("dialog", { name: "Kotak Mahindra Mutual Fund" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId(`slice-${KOTAK}`)).toHaveAttribute("data-selected", "true");
  });
  it("lists every fund of an AMC held by several members and the rows add up to the AMC's value", () => {
    const extra: HoldingRow = { ...fx.holdings()[0], scheme_id: "S-KOTAK-2", scheme_name: "Kotak Small Cap Fund", current_value: "200000.00" };
    const allocation: AllocationSummary = { ...fx.allocation().allocation, by_amc: [{ label: "Kotak Mahindra Mutual Fund", current_value: "1740000.00", percentage: 100 }], total_value: "1740000.00" };
    amc({ allocation: loaded(allocation), holdings: loaded([fx.holdings()[0], extra]) });
    fireEvent.click(screen.getByTestId(`slice-${KOTAK}`));
    const rows = within(screen.getByRole("dialog")).getAllByTestId("drill-row");
    expect(rows.map(r => r.getAttribute("data-value"))).toEqual(["1540000.00", "200000.00"]);
  });
  it("shows legend values that add up to the total portfolio value", () => {
    amc();
    const values = screen.getAllByTestId(/^legend-/).map(el => el.getAttribute("data-value")!);
    expect(values).toEqual(["1540000.00", "1310000.00", "980000.00", "819340.00"]);
  });
  it("shows a loading state and a failure card with Retry", () => {
    const { unmount } = amc({ allocation: loadingLoad() });
    expect(screen.getByRole("status", { name: "Loading AMC allocation" })).toBeInTheDocument();
    unmount();
    const allocation = failedLoad<AllocationSummary>();
    amc({ allocation });
    expect(screen.getByRole("heading", { name: "Couldn't load your AMC allocation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(allocation.retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = amc();
    expectInteractivity(container, 4);
  });
});

describe("FamilyMembersCard", () => {
  it("lists each member with their value and share of the portfolio", () => {
    family();
    expect(screen.getByRole("heading", { name: "Family Members" })).toBeInTheDocument();
    expect(screen.getByText("Click a member to switch the whole page's scope to just their holdings.")).toBeInTheDocument();
    expect(screen.getByTestId("family-value-m1")).toHaveTextContent("₹15,40,000 (33.1%)");
    expect(screen.getByTestId("family-value-m2")).toHaveTextContent("₹9,80,000 (21.1%)");
    expect(screen.getByTestId("family-value-m3")).toHaveTextContent("₹21,29,340 (45.8%)");
    expect(screen.getByTestId("family-avatar-m1")).toHaveTextContent("S");
    expect(screen.getByTestId("family-segment-2")).toHaveStyle({ width: "45.7988%" });
    expect(screen.getAllByTestId(/^family-row-/).map(r => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Siddharth")]));
  });
  it("switches the whole page to a member on a click, Enter or Space, and ignores other keys", () => {
    const setMember = vi.fn();
    family({}, { scope: { members, setMember } });
    fireEvent.click(screen.getByTestId("family-row-m2"));
    expect(setMember).toHaveBeenLastCalledWith("m2");
    fireEvent.keyDown(screen.getByTestId("family-row-m3"), { key: "Enter" });
    expect(setMember).toHaveBeenLastCalledWith("m3");
    fireEvent.keyDown(screen.getByTestId("family-row-m1"), { key: " " });
    expect(setMember).toHaveBeenLastCalledWith("m1");
    fireEvent.keyDown(screen.getByTestId("family-row-m1"), { key: "a" });
    expect(setMember).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByTestId("family-segment-1"));
    expect(setMember).toHaveBeenLastCalledWith("m2");
  });
  it("shows the note instead of a comparison for a household of one", () => {
    family({ members: loaded<FamilyMemberStatus[]>([fx.MEMBERS[0]]) });
    expect(screen.getByText("You're the only member in this household — nothing to compare yet. Add a family member from Profile to see a breakdown here.")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^family-row-/)).toHaveLength(0);
  });
  it("is left out of a member view", () => {
    const { container } = family({}, { scope: { members, viewMode: "member", memberId: "m1" } });
    expect(container).toBeEmptyDOMElement();
  });
  it("shows a zero for a member with no priced funds", () => {
    family({ holdings: loaded(fx.holdings().filter(h => h.scheme_id !== "S-JM")) });
    expect(screen.getByTestId("family-value-m2")).toHaveTextContent("₹0 (0.0%)");
  });
  it("shows a loading state and a failure card with Retry", () => {
    const { unmount } = family({ holdings: loadingLoad() });
    expect(screen.getByRole("status", { name: "Loading family members" })).toBeInTheDocument();
    unmount();
    const holdings = failedLoad<HoldingRow[]>();
    family({ holdings });
    expect(screen.getByRole("heading", { name: "Couldn't load family members" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(holdings.retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = family();
    expectInteractivity(container, 3);
  });
});

describe("QuickInsightsCard", () => {
  it("lists the four lines as static text", () => {
    const lines = ["one", "two", "three", "four"];
    const { container } = renderInShell(<QuickInsightsCard lines={lines} />, { path: "/portfolio/mutual-funds" });
    expect(screen.getByRole("heading", { name: "Quick Insights" })).toBeInTheDocument();
    expect(screen.getByText("From your current MF holdings")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(lines);
    expect(container.querySelector("[data-static]")).not.toBeNull();
    expect(container.querySelectorAll("button, [data-clickable]")).toHaveLength(0);
  });
});

describe("AmcAllocationCard: the funds in the drill popup open their fund page (IF-E)", () => {
  it("links every fund row of the opened AMC to its page, keeping the value", () => {
    amc();
    fireEvent.click(within(screen.getByTestId("legend-hdfc-mutual-fund")).getByRole("button"));
    const dialog = screen.getByRole("dialog", { name: "HDFC Mutual Fund" });
    const rows = within(dialog).getAllByTestId("drill-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const link = within(row).getByRole("link");
      const holding = fx.holdings().find(h => h.scheme_name === link.textContent)!;
      expect(holding).toBeDefined();
      expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${encodeURIComponent(holding.scheme_id)}`);
      expect(row).toHaveTextContent("₹");
    }
    expect(within(dialog).getAllByRole("link")).toHaveLength(rows.length);
  });
  it("shows a holding with no scheme id as plain text", () => {
    const rows = fx.holdings().map((h, index) => (index === 0 ? { ...h, scheme_id: "" } : h));
    const first = rows[0];
    const allocation: AllocationSummary = { ...fx.allocation().allocation, by_amc: [{ label: first.amc_name!, current_value: first.current_value!, percentage: 100 }], total_value: first.current_value! };
    amc({ allocation: loaded(allocation), holdings: loaded(rows) });
    fireEvent.click(screen.getByTestId(`slice-${first.amc_name!.toLowerCase().replaceAll(" ", "-")}`));
    const dialog = screen.getByRole("dialog", { name: first.amc_name! });
    expect(within(dialog).queryByRole("link", { name: first.scheme_name })).toBeNull();
    expect(within(dialog).getByText(first.scheme_name)).toBeInTheDocument();
  });
});
