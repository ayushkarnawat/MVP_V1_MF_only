import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundManagerSection } from "./FundManagerSection";
import type { FundManagerAllocationSummary } from "./types";

const summary: FundManagerAllocationSummary = {
  manager_groups: [{ manager_name: "Anita", amc_name: "Alpha Mutual Fund", percentage: "37.50",
    role: null, total_household_value: "150000.00", funds: [] }],
  unavailable_schemes: [{ scheme_id: "s3", scheme_name: "HDFC Balanced Fund", amc_name: "HDFC Mutual Fund" }],
  portfolio_value: "400000.00", covered_value: "350000.00", covered_percentage: "87.50",
};

describe("FundManagerSection", () => {
  it("shows exactly four columns", () => {
    render(<FundManagerSection data={summary} />);
    expect(screen.getAllByRole("columnheader").map(h => h.textContent)).toEqual([
      "Fund manager", "AMC", "Current value", "% of overall portfolio",
    ]);
  });
  it("shows each manager's AMC, value and share", () => {
    render(<FundManagerSection data={summary} />);
    const row = screen.getByText("Anita").closest("tr")!;
    expect(row).toHaveTextContent("Alpha Mutual Fund");
    expect(within(row).getByText("₹1,50,000")).toBeInTheDocument();
    expect(within(row).getByText("37.5%")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows the covered total row and the equal-split footnote", () => {
    render(<FundManagerSection data={summary} />);
    const row = screen.getByText("Covered by manager data").closest("tr")!;
    expect(row).toHaveTextContent("₹3,50,000");
    expect(row).toHaveTextContent("87.5%");
    expect(screen.getByText("Funds with more than one manager are divided equally between them.")).toBeInTheDocument();
  });
  it("keeps the not-available list", () => {
    render(<FundManagerSection data={summary} />);
    expect(screen.getByText("Fund manager data for these schemes isn't available yet.")).toBeInTheDocument();
    expect(screen.getByText(/HDFC Balanced Fund/)).toHaveTextContent("HDFC Balanced Fund (HDFC Mutual Fund)");
  });
  it("print mode shows the same table", () => {
    const { container, rerender } = render(<FundManagerSection data={summary} />);
    const table = screen.getByRole("table").outerHTML;
    rerender(<FundManagerSection data={summary} printMode />);
    expect(screen.getByRole("table").outerHTML).toBe(table);
    expect(container.querySelector("button")).toBeNull();
  });
  it("an old payload without AMC and percentage renders dashes, not NaN", () => {
    const { container } = render(<FundManagerSection data={{ manager_groups: [{
      manager_name: "Old", role: null, total_household_value: "1234.50", funds: [],
    }], unavailable_schemes: [] }} />);
    const row = screen.getByText("Old").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(row).toHaveTextContent("₹1,235");
    expect(within(screen.getByText("Covered by manager data").closest("tr")!).getAllByText("—")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
  it("keeps the same manager at two AMCs in separate rows", () => {
    render(<FundManagerSection data={{ ...summary, manager_groups: [summary.manager_groups[0], {
      ...summary.manager_groups[0], amc_name: "Beta Mutual Fund", total_household_value: "100000.00", percentage: "25.00",
    }] }} />);
    expect(screen.getAllByText("Anita")).toHaveLength(2);
    expect(screen.getByText("Beta Mutual Fund").closest("tr")).toHaveTextContent("25%");
  });
  it("keeps large and negative displayed money exact, with half-up rounding", () => {
    render(<FundManagerSection data={{ ...summary, manager_groups: [{ ...summary.manager_groups[0],
      total_household_value: "-9007199254740992.50", percentage: "-0.01",
    }] }} />);
    expect(screen.getByText("-₹9,00,71,99,25,47,40,993")).toBeInTheDocument();
    expect(screen.getByText("-0.01%")).toBeInTheDocument();
  });
  it("keeps unavailable-only portfolios visible without fake manager rows", () => {
    render(<FundManagerSection data={{ ...summary, manager_groups: [] }} />);
    expect(screen.getByText(/isn't available yet/)).toBeInTheDocument();
    expect(screen.queryByText("No fund manager data available")).not.toBeInTheDocument();
  });
  it.each([null, { manager_groups: [], unavailable_schemes: [] }])("shows the empty state for %s", data => {
    render(<FundManagerSection data={data} />);
    expect(screen.getByText("No fund manager data available")).toBeInTheDocument();
  });
  it("skeleton while loading", () => {
    const { container } = render(<FundManagerSection data={summary} isLoading />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Anita")).not.toBeInTheDocument();
  });
});
