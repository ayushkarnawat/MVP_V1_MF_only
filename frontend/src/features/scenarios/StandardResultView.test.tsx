import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandardResultView } from "./StandardResultView";
import { historicalResult } from "./testFixtures";

describe("StandardResultView", () => {
  it("shows compliance, household coverage, benchmarks and distinct real/estimated/no-data states", () => {
    render(<StandardResultView result={historicalResult} />);
    expect(screen.getByText(/not a prediction of future returns/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("Portfolio impact")).getByText("-32.50%")).toBeInTheDocument();
    expect(screen.getByText("Based on ₹20,00,000 of your ₹21,00,000 · 1 fund has no data for this period")).toBeInTheDocument();
    expect(screen.getByText("Nifty 50")).toBeInTheDocument();
    expect(screen.getByText("-30.00%")).toBeInTheDocument();
    expect(screen.getByText("~-20.00%")).toHaveAttribute("title", historicalResult.by_fund[1].proxy_basis);
    expect(screen.getByText("Category average estimate")).toBeInTheDocument();
    expect(screen.getByText("Not enough historical data to estimate")).toBeInTheDocument();
  });
  it("expands a member's actual group fund breakdown and retains an empty member", () => {
    render(<StandardResultView result={{ ...historicalResult, by_member: [...historicalResult.by_member, { household_member_id: "empty", member_name: "No Holdings", rupee_impact: "0.00", pct: null, funds: [] }] }} />);
    const button = screen.getByRole("button", { name: /Ayush/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("No Holdings")).toBeInTheDocument();
    expect(screen.getAllByText("Real Fund")).toHaveLength(2);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
  it("does not turn null household values into zero", () => {
    render(<StandardResultView result={{ ...historicalResult, portfolio_impact_pct: null, rupee_impact: null, covered_value: null, total_value: null, no_data_funds: null, benchmarks: [], by_fund: [], by_member: [] }} />);
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
  });
  it("rounds only the estimate display to the nearest five percent and names asset fallback", () => {
    render(<StandardResultView result={{ ...historicalResult, by_fund: [{ ...historicalResult.by_fund[1], pct: "-21.37", proxy_basis: "asset_class_average:Equity" }] }} />);
    expect(screen.getByText("~-20.00%")).toBeInTheDocument();
    expect(screen.getByText("Asset-class average estimate")).toBeInTheDocument();
  });
});
