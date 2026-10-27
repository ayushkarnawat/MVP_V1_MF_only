import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fc from "../fixtures/mfCother";
import { expectInteractivity } from "../testing";
import type { CategoryRankingSummary, DirectRegularTerComparison, WeightedTerSummary } from "../types";
import { TerLadder } from "./TerLadder";

interface Over { ter?: WeightedTerSummary; comparison?: DirectRegularTerComparison | null; ranking?: CategoryRankingSummary | null }
const mount = (over: Over = {}) => render(<TerLadder
  ter={over.ter ?? fc.terSummary()}
  comparison={over.comparison === undefined ? fc.terDirectRegular() : over.comparison}
  ranking={over.ranking === undefined ? fc.categoryRanking() : over.ranking}
/>);
const toggle = (id: string) => screen.getByTestId(`ladder-toggle-${id}`);
const ids = () => within(screen.getByRole("list", { name: "Cost ladder" })).getAllByRole("listitem").map(item => item.getAttribute("data-testid"));

describe("the hero", () => {
  it("shows the weighted TER, what it costs a year and how much of the portfolio it covers", () => {
    mount();
    expect(screen.getByTestId("ter-weighted")).toHaveTextContent("0.64%");
    expect(screen.getByText("AUM-Wtd TER")).toBeInTheDocument();
    expect(screen.getByTestId("ter-hero-sub")).toHaveTextContent("₹24,505/yr at today's value · covers ₹38.30 L of ₹46.49 L portfolio value");
    expect(screen.getByTestId("ter-ref")).toHaveTextContent("Ref: 31 Mar 2026");
    expect(screen.getByText(/Projected annual cost if your value and each fund's TER stay as they are today — not a forecast of returns\./)).toBeInTheDocument();
  });
  it("draws the gauge arc as the weighted TER's share of the 2.5 percent scale", () => {
    mount();
    expect(screen.getByTestId("gauge-arc")).toHaveAttribute("data-length", "61.12");
  });
  it("has a tooltip on the hero", () => {
    mount();
    expect(screen.getByTestId("ter-hero")).toHaveAttribute("title", "Each fund's TER weighted by what you hold in it: the annual management fee across your portfolio.");
    expect(screen.getByTestId("ter-hero")).toHaveAttribute("data-tooltip");
  });
  it("says TER data is unavailable, with an empty arc, when there is no weighted TER", () => {
    mount({ ter: { ...fc.terSummary(), weighted_ter: null, cost_1y: null, funds: [] } });
    expect(screen.getByTestId("ter-unavailable")).toHaveTextContent("TER data unavailable");
    expect(screen.queryByTestId("ter-weighted")).not.toBeInTheDocument();
    expect(screen.getByTestId("gauge-arc")).toHaveAttribute("data-length", "0");
    expect(screen.getByTestId("ter-hero-sub")).toHaveTextContent("covers ₹38.30 L of ₹46.49 L portfolio value");
    expect(screen.getByTestId("ter-hero-sub")).not.toHaveTextContent("/yr");
  });
  it("writes a large yearly cost in full rupees with Indian grouping, never in lakhs", () => {
    mount({ ter: { ...fc.terSummary(), cost_1y: "1234567.00" } });
    expect(screen.getByTestId("ter-hero-sub")).toHaveTextContent("₹12,34,567/yr at today\x27s value");
  });
  it("leaves out the reference period when there is none", () => {
    mount({ ter: { ...fc.terSummary(), reference_period: null } });
    expect(screen.queryByTestId("ter-ref")).not.toBeInTheDocument();
  });
});

describe("the Direct and Regular spectrum", () => {
  it("pins the Direct plans' TER and says the Regular plans have no TER on record, with each plan's value", () => {
    mount();
    expect(screen.getByTestId("pin-direct")).toHaveTextContent("Direct 0.64%");
    expect(screen.getByTestId("pin-direct")).toHaveAttribute("data-x", "25.6");
    expect(screen.getByTestId("dot-direct")).toHaveStyle({ left: "25.6%" });
    expect(screen.getByTestId("value-direct")).toHaveTextContent("Direct value: ₹38.30 L");
    expect(screen.getByTestId("plan-regular")).toHaveAttribute("data-state", "no-ter");
    expect(screen.getByTestId("plan-regular")).toHaveTextContent("No TER on record for the Regular plans you hold.");
    expect(screen.getByTestId("value-regular")).toHaveTextContent("Regular value: ₹8.19 L");
    expect(screen.queryByTestId("pin-regular")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dot-regular")).not.toBeInTheDocument();
  });
  it("pins both plans when both have a TER, each with a tooltip", () => {
    mount({ comparison: fc.terDirectRegularBoth() });
    expect(screen.getByTestId("pin-regular")).toHaveTextContent("Regular 1.42%");
    expect(screen.getByTestId("pin-regular")).toHaveAttribute("data-x", "56.8");
    expect(screen.getByTestId("dot-regular")).toHaveStyle({ left: "56.8%" });
    expect(screen.getByTestId("pin-regular")).toHaveAttribute("title", "Regular plans: 1.42% a year, weighted by value");
    expect(screen.getByTestId("pin-direct")).toHaveAttribute("title", "Direct plans: 0.64% a year, weighted by value");
    expect(screen.getByTestId("pin-direct")).toHaveAttribute("data-tooltip");
  });
  it("stretches the scale beyond 2.5 percent when a TER is higher", () => {
    const both = fc.terDirectRegularBoth();
    both.regular.weighted_ter = "5.00";
    mount({ comparison: both });
    expect(screen.getByTestId("pin-direct")).toHaveAttribute("data-x", "12.8");
    expect(screen.getByTestId("pin-regular")).toHaveAttribute("data-x", "100");
  });
  it("says there is nothing to compare when a plan is not held", () => {
    const comparison = fc.terDirectRegular();
    comparison.regular = { ...comparison.regular, total_value: "0", uncovered_schemes: [] };
    comparison.direct = { ...comparison.direct, weighted_ter: null, total_value: "0.00", covered_value: "0", cost_1y: null };
    mount({ comparison });
    expect(screen.getByTestId("plan-regular")).toHaveAttribute("data-state", "none-held");
    expect(screen.getByTestId("plan-regular")).toHaveTextContent("No Regular plans in this portfolio, so there is nothing to compare against.");
    expect(screen.getByTestId("value-regular")).toHaveTextContent("No Regular holdings");
    expect(screen.getByTestId("plan-direct")).toHaveTextContent("No Direct plans in this portfolio, so there is nothing to compare against.");
    expect(screen.getByTestId("value-direct")).toHaveTextContent("No Direct holdings");
  });
  it("says there is no TER on record for Direct plans that have none", () => {
    const comparison = fc.terDirectRegular();
    comparison.direct = { ...comparison.direct, weighted_ter: null };
    mount({ comparison });
    expect(screen.getByTestId("plan-direct")).toHaveTextContent("No TER on record for the Direct plans you hold.");
  });
  it("says the comparison is unavailable when it could not be loaded, and still shows the rest", () => {
    mount({ comparison: null });
    expect(screen.getByTestId("ter-comparison-missing")).toHaveTextContent("The Direct and Regular comparison is not available right now.");
    expect(screen.queryByTestId("ter-spectrum")).not.toBeInTheDocument();
    expect(screen.getByTestId("ter-weighted")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Cost ladder" })).toBeInTheDocument();
  });
});

describe("the savings line", () => {
  it("is absent while the backend sends no annual_ter_saving", () => {
    mount();
    expect(screen.queryByTestId("ter-savings")).not.toBeInTheDocument();
  });
  it("is built from annual_ter_saving, not from the gap between the two plan averages", () => {
    mount({ ter: fc.terSummaryWithSavings(), comparison: fc.terDirectRegularBoth() });
    expect(screen.getByTestId("ter-savings")).toHaveTextContent("Your 3 Direct-plan holdings are already saving an estimated ₹29,595/yr combined versus the Regular-plan version of the same schemes — see each fund's own saving below.");
    expect(screen.getByTestId("ter-savings")).not.toHaveTextContent("0.78");
    expect(screen.getByTestId("ladder-badge-S-KOTAK")).toHaveTextContent("Direct · saves ₹12,782/yr");
    expect(screen.getByTestId("ladder-badge-S-HDFC")).toHaveTextContent("Direct · saves ₹8,777/yr");
    expect(screen.getByTestId("ladder-badge-S-JM")).toHaveTextContent("Direct · saves ₹8,036/yr");
  });
});

describe("the cost ladder", () => {
  it("has its heading, lists the cheapest fund first and the fund without a TER last", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Cost ladder — relative TER across your holdings · click a fund for its 1Y/3Y/5Y returns" })).toBeInTheDocument();
    expect(ids()).toEqual(["ladder-S-KOTAK", "ladder-S-JM", "ladder-S-HDFC", "ladder-S-SBI"]);
    expect(screen.getAllByTestId("fund-logo")).toHaveLength(4);
  });
  it("shows each fund's TER, plan, value and projected costs, the same rupee figures as the summary", () => {
    mount();
    expect(screen.getByTestId("ladder-ter-S-KOTAK")).toHaveTextContent("0.58%");
    expect(screen.getByTestId("ladder-badge-S-KOTAK")).toHaveTextContent("Direct");
    expect(screen.getByTestId("ladder-sub-S-KOTAK")).toHaveTextContent("Your value ₹15,40,000 · projected cost 1yr ₹8,932 · 3yr ₹26,796 · 5yr ₹44,660");
    expect(screen.getByTestId("ladder-sub-S-JM")).toHaveTextContent("Your value ₹9,80,000 · projected cost 1yr ₹6,272 · 3yr ₹18,816 · 5yr ₹31,360");
    expect(screen.getByTestId("ladder-sub-S-HDFC")).toHaveTextContent("Your value ₹13,10,000 · projected cost 1yr ₹9,301 · 3yr ₹27,903 · 5yr ₹46,505");
  });
  it("sizes the bars against the highest TER and colours them below or above the weighted TER", () => {
    mount();
    expect(screen.getByTestId("ladder-bar-S-KOTAK")).toHaveStyle({ width: "81.69%" });
    expect(screen.getByTestId("ladder-bar-S-JM")).toHaveStyle({ width: "90.14%" });
    expect(screen.getByTestId("ladder-bar-S-HDFC")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("ladder-bar-S-KOTAK")).toHaveAttribute("data-tone", "below");
    expect(screen.getByTestId("ladder-bar-S-JM")).toHaveAttribute("data-tone", "below");
    expect(screen.getByTestId("ladder-bar-S-HDFC")).toHaveAttribute("data-tone", "above");
    expect(screen.getByTestId("ladder-bar-S-KOTAK")).toHaveStyle({ backgroundColor: "var(--pos)" });
    expect(screen.getByTestId("ladder-bar-S-HDFC")).toHaveStyle({ backgroundColor: "var(--warn-text)" });
  });
  it("mutes the fund without a TER: no bar, a dash, no plan badge and a line saying it is left out of the totals", () => {
    mount();
    expect(screen.getByTestId("ladder-S-SBI")).toHaveAttribute("data-muted", "true");
    expect(screen.getByTestId("ladder-S-KOTAK")).toHaveAttribute("data-muted", "false");
    expect(screen.queryByTestId("ladder-bar-S-SBI")).not.toBeInTheDocument();
    expect(screen.getByTestId("ladder-ter-S-SBI")).toHaveTextContent("—");
    expect(screen.queryByTestId("ladder-badge-S-SBI")).not.toBeInTheDocument();
    expect(screen.getByTestId("ladder-sub-S-SBI")).toHaveTextContent("Your value ₹8,19,340 · no TER on file, excluded from totals below");
  });
  it("shows no plan badge for an unclassified plan", () => {
    const ter = fc.terSummary();
    ter.funds![0].plan_type = "unclassified";
    mount({ ter });
    expect(screen.queryByTestId("ladder-badge-S-KOTAK")).not.toBeInTheDocument();
  });
  it("totals the funds that have a TER, counts the one that has none and lists the exclusion", () => {
    mount();
    expect(screen.getByTestId("ladder-total")).toHaveTextContent("Total (3 funds with a TER)");
    expect(screen.getByTestId("ladder-total")).toHaveTextContent("₹38,30,000 · 1yr ₹24,505 · 3yr ₹73,515 · 5yr ₹1,22,525");
    expect(screen.getByTestId("ladder-no-ter-note")).toHaveTextContent("1 fund without a TER is not included in the projected totals above.");
    expect(screen.getByTestId("ter-exclusions")).toHaveAttribute("role", "note");
    expect(screen.getByTestId("ter-exclusions")).toHaveTextContent("TER Exclusions (1 fund excluded)");
    expect(screen.getByTestId("ter-exclusions")).toHaveTextContent("The weighted TER calculation currently excludes SBI Bluechip Fund due to missing AMFI disclosures.");
  });
  it("pluralises the exclusions and names every excluded fund", () => {
    const ter = fc.terSummary();
    ter.uncovered_schemes = ["Alpha Fund", "Bravo Fund"];
    mount({ ter });
    expect(screen.getByTestId("ter-exclusions")).toHaveTextContent("TER Exclusions (2 funds excluded)");
    expect(screen.getByTestId("ter-exclusions")).toHaveTextContent("excludes Alpha Fund, Bravo Fund due to");
  });
  it("shows no exclusions, totals or ladder when every fund has a TER or there are no funds", () => {
    const ter = fc.terSummary();
    ter.uncovered_schemes = [];
    ter.funds = ter.funds!.filter(fund => fund.ter !== null);
    mount({ ter });
    expect(screen.queryByTestId("ter-exclusions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ladder-no-ter-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("ladder-total")).toBeInTheDocument();
  });
  it("has no ladder at all without funds", () => {
    mount({ ter: { ...fc.terSummary(), funds: [] } });
    expect(screen.queryByRole("list", { name: "Cost ladder" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("ladder-total")).not.toBeInTheDocument();
  });
  it("shows each fund's rupee value once", () => {
    const { container } = mount();
    for (const value of ["₹15,40,000", "₹13,10,000", "₹9,80,000", "₹8,19,340"]) expect(container.textContent!.split(value).length - 1).toBe(1);
  });
});

describe("expanding a ladder row", () => {
  it("opens the fund's 1Y, 3Y and 5Y returns, taken from the category-ranking section, and marks the row open", () => {
    mount();
    expect(toggle("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ladder-detail-S-KOTAK")).not.toBeInTheDocument();
    fireEvent.click(toggle("S-KOTAK"));
    expect(toggle("S-KOTAK")).toHaveAttribute("aria-expanded", "true");
    const table = within(screen.getByTestId("ladder-detail-S-KOTAK")).getByRole("table", { name: "Kotak Multi Cap Fund returns" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Fund", "1Y", "3Y", "5Y"]);
    expect(["1y", "3y", "5y"].map(key => screen.getByTestId(`ladder-return-S-KOTAK-${key}`).textContent)).toEqual(["18.4%", "15.1%", "16.8%"]);
  });
  it("shows the same return figures as the Category Rank rows for every fund they share", () => {
    mount();
    for (const fund of fc.categoryRanking().funds.filter(row => row.periods && Object.keys(row.periods).length > 0)) {
      fireEvent.click(toggle(fund.scheme_id));
      for (const key of ["1y", "3y", "5y"] as const) {
        const expected = fund.periods![key]!.fund_return!;
        const shown = screen.getByTestId(`ladder-return-${fund.scheme_id}-${key}`).textContent;
        expect(shown).toBe(`${(Number(expected) * 100).toFixed(1)}%`);
      }
    }
  });
  it("opens one row at a time and closes a row on a second click", () => {
    mount();
    fireEvent.click(toggle("S-KOTAK"));
    fireEvent.click(toggle("S-HDFC"));
    expect(toggle("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(toggle("S-HDFC")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("ladder-detail-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.getByTestId("ladder-return-S-HDFC-1y")).toHaveTextContent("19.0%");
    fireEvent.click(toggle("S-HDFC"));
    expect(screen.queryByTestId("ladder-detail-S-HDFC")).not.toBeInTheDocument();
  });
  it("says there is no return data for the fund without a TER", () => {
    mount();
    fireEvent.click(toggle("S-SBI"));
    expect(screen.getByTestId("ladder-detail-S-SBI")).toHaveTextContent("No return data on file for this fund.");
    expect(screen.queryByRole("table", { name: /returns$/ })).not.toBeInTheDocument();
  });
  it("says there is no return data for every fund when the category-ranking section is not available", () => {
    mount({ ranking: null });
    fireEvent.click(toggle("S-KOTAK"));
    expect(screen.getByTestId("ladder-detail-S-KOTAK")).toHaveTextContent("No return data on file for this fund.");
  });
  it("shows a dash for a period the fund has no return for", () => {
    const ranking = fc.categoryRanking();
    ranking.funds[0].periods = { "3y": { fund_return: "0.1510", category_avg: "0.1300", peers: 28 } };
    mount({ ranking });
    fireEvent.click(toggle("S-KOTAK"));
    expect(screen.getByTestId("ladder-return-S-KOTAK-1y")).toHaveTextContent("—");
    expect(screen.getByTestId("ladder-return-S-KOTAK-3y")).toHaveTextContent("15.1%");
  });
});

describe("every control", () => {
  it("is marked with its effect and exposes its state", () => {
    const { container } = mount({ ter: fc.terSummaryWithSavings(), comparison: fc.terDirectRegularBoth() });
    fireEvent.click(toggle("S-JM"));
    expectInteractivity(container, 4);
    expect(container.querySelectorAll("[data-clickable]")).toHaveLength(4);
  });
});
