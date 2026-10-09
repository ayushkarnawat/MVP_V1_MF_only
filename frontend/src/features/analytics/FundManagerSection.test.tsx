import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundManagerSection } from "./FundManagerSection";
import type { FundManagerAllocationSummary } from "./types";

const summary: FundManagerAllocationSummary = {
  manager_groups: [
    {
      manager_name: "Jane Doe", role: null, total_household_value: "200000",
      funds: [{ scheme_id: "s1", scheme_name: "Fund A", household_value: "200000", sequence_order: 0, role: null }],
    },
    {
      manager_name: "John Roe", role: "Assistant Fund Manager", total_household_value: "200000",
      funds: [{ scheme_id: "s1", scheme_name: "Fund A", household_value: "200000", sequence_order: 1, role: "Assistant Fund Manager" }],
    },
  ],
  unavailable_schemes: [{ scheme_id: "s3", scheme_name: "HDFC Balanced Fund", amc_name: "HDFC Mutual Fund" }],
};

describe("FundManagerSection", () => {
  it("renders separate co-manager cards in backend order with only source role badges", () => {
    render(<FundManagerSection data={summary} />);
    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Jane Doe");
    expect(cards[1]).toHaveTextContent("John Roe");
    expect(within(cards[0]).queryByText(/Manager/)).not.toBeInTheDocument();
    expect(within(cards[1]).getByText("Assistant Fund Manager")).toBeInTheDocument();
    expect(screen.queryByText(/Primary Manager|\+1 more/)).not.toBeInTheDocument();
    expect(within(cards[0]).getByText("₹2,00,000")).toBeInTheDocument();
    expect(screen.getByText("Who is actually running your money, aggregated across your whole portfolio")).toBeInTheDocument();
  });

  it("starts collapsed and independently expands and collapses co-managers' held funds", () => {
    render(<FundManagerSection data={summary} />);
    const jane = screen.getByRole("button", { name: /Jane Doe/ });
    const john = screen.getByRole("button", { name: /John Roe/ });
    expect(jane).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Fund A")).not.toBeInTheDocument();
    fireEvent.click(jane);
    expect(jane).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(jane.getAttribute("aria-controls")!)).toHaveTextContent("Fund A");
    expect(screen.getAllByText("Fund A")).toHaveLength(1);
    fireEvent.click(john);
    expect(screen.getAllByText("Fund A")).toHaveLength(2);
    fireEvent.click(jane);
    expect(jane).toHaveAttribute("aria-expanded", "false");
    expect(john).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Fund A")).toHaveLength(1);
  });

  it("shows mixed roles on their own fund rows without a misleading card badge", () => {
    render(<FundManagerSection data={{
      manager_groups: [{ manager_name: "Jane Doe", role: null, total_household_value: "250000", funds: [
        summary.manager_groups[0].funds[0],
        { scheme_id: "s2", scheme_name: "Fund B", household_value: "50000", sequence_order: 1, role: "Assistant Fund Manager" },
        { scheme_id: "s4", scheme_name: "Fund C", household_value: "0", sequence_order: 1, role: "Overseas Investments" },
      ] }], unavailable_schemes: [],
    }} />);
    const card = screen.getByRole("button", { name: /Jane Doe/ });
    expect(within(card).queryByText("Assistant Fund Manager")).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.getByText("Fund B").parentElement).toHaveTextContent("Assistant Fund Manager");
    expect(screen.getByText("Fund C").parentElement).toHaveTextContent("Overseas Investments");
    expect(screen.getByText("Fund A").parentElement).not.toHaveTextContent("Assistant Fund Manager");
    expect(screen.queryByText("Primary Manager")).not.toBeInTheDocument();
    expect(screen.getByText("₹50,000")).toBeInTheDocument();
  });

  it("shows the agreed role once on the card rather than repeating it on each fund", () => {
    render(<FundManagerSection data={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /John Roe/ }));
    expect(screen.getAllByText("Assistant Fund Manager")).toHaveLength(1);
  });

  it("renders unresolved schemes and AMC names in the trailing unavailable block", () => {
    render(<FundManagerSection data={summary} />);
    expect(screen.getByText("Fund manager data for these schemes isn't available yet.")).toBeInTheDocument();
    expect(screen.getByText(/HDFC Balanced Fund/)).toHaveTextContent("HDFC Balanced Fund (HDFC Mutual Fund)");
  });

  it("keeps unavailable-only portfolios visible without fake manager cards", () => {
    render(<FundManagerSection data={{ ...summary, manager_groups: [] }} />);
    expect(screen.getByRole("heading", { name: "Fund Manager Allocation" })).toBeInTheDocument();
    expect(screen.getByText(/isn't available yet/)).toBeInTheDocument();
    expect(screen.queryByText("No fund manager data available")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([null, { manager_groups: [], unavailable_schemes: [] }])("shows the empty state for %s", (data) => {
    render(<FundManagerSection data={data} />);
    expect(screen.getByRole("heading", { name: "Fund Manager Allocation" })).toBeInTheDocument();
    expect(screen.getByText("No fund manager data available")).toBeInTheDocument();
  });

  it("shows skeletons rather than stale cards or an empty state while loading", () => {
    const { container } = render(<FundManagerSection data={summary} isLoading />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(screen.queryByText("No fund manager data available")).not.toBeInTheDocument();
  });
});
